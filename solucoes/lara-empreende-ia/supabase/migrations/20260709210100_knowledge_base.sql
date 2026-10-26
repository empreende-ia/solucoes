-- Base de conhecimento da Lara: fatos canônicos + documentos com busca híbrida (FTS + trigram)
-- e registro de perguntas sem resposta (loop de treinamento)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Fatos canônicos: verdades curtas e verbatim (preço, link, horário, política)
CREATE TABLE IF NOT EXISTS public.knowledge_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL DEFAULT 'geral',
    question TEXT,
    fact TEXT NOT NULL,
    source TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    always_include BOOLEAN NOT NULL DEFAULT false,
    fts tsvector GENERATED ALWAYS AS (
        to_tsvector('portuguese', coalesce(question, '') || ' ' || fact)
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_facts_fts ON public.knowledge_facts USING gin(fts);
CREATE INDEX IF NOT EXISTS idx_knowledge_facts_trgm ON public.knowledge_facts USING gin(fact gin_trgm_ops);

-- 2. Documentos longos (FAQ, institucional, tabelas de preço) divididos em chunks
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'texto' CHECK (doc_type IN ('texto', 'faq', 'url')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    fts tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts ON public.knowledge_chunks USING gin(fts);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_trgm ON public.knowledge_chunks USING gin(content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON public.knowledge_chunks(document_id);

-- 3. Perguntas que a Lara não soube responder (alimenta o treinamento)
CREATE TABLE IF NOT EXISTS public.unanswered_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    question TEXT NOT NULL,
    context TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
    resolved_fact_id UUID REFERENCES public.knowledge_facts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unanswered_questions_status ON public.unanswered_questions(status);

-- 4. RLS: leitura para autenticados; escrita para admin (padrão das tabelas de config)
ALTER TABLE public.knowledge_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['knowledge_facts', 'knowledge_documents', 'knowledge_chunks']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated can read %I" ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY "Authenticated can read %I" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Admins can manage %I" ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY "Admins can manage %I" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t, t);
    END LOOP;
END $$;

DROP POLICY IF EXISTS "Authenticated can manage unanswered questions" ON public.unanswered_questions;
CREATE POLICY "Authenticated can manage unanswered questions"
    ON public.unanswered_questions FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP TRIGGER IF EXISTS update_knowledge_facts_updated_at ON public.knowledge_facts;
CREATE TRIGGER update_knowledge_facts_updated_at
    BEFORE UPDATE ON public.knowledge_facts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_documents_updated_at ON public.knowledge_documents;
CREATE TRIGGER update_knowledge_documents_updated_at
    BEFORE UPDATE ON public.knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Busca híbrida (full-text português + similaridade trigram) sobre fatos e chunks
CREATE OR REPLACE FUNCTION public.search_knowledge(p_query TEXT, p_limit INTEGER DEFAULT 6)
RETURNS TABLE (
    source_type TEXT,
    source_id UUID,
    title TEXT,
    content TEXT,
    rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH q AS (
        SELECT websearch_to_tsquery('portuguese', p_query) AS tsq
    ),
    fact_hits AS (
        SELECT
            'fact'::TEXT AS source_type,
            f.id AS source_id,
            coalesce(nullif(f.question, ''), f.category) AS title,
            f.fact AS content,
            (COALESCE(ts_rank(f.fts, q.tsq), 0) * 2.0
             + similarity(f.fact, p_query))::REAL AS rank
        FROM public.knowledge_facts f
        CROSS JOIN q
        WHERE f.is_active
          AND (f.fts @@ q.tsq OR similarity(coalesce(f.question, '') || ' ' || f.fact, p_query) > 0.12)
    ),
    chunk_hits AS (
        SELECT
            'chunk'::TEXT AS source_type,
            c.id AS source_id,
            d.title,
            c.content,
            (COALESCE(ts_rank(c.fts, q.tsq), 0)
             + similarity(c.content, p_query) * 0.5)::REAL AS rank
        FROM public.knowledge_chunks c
        JOIN public.knowledge_documents d ON d.id = c.document_id AND d.is_active
        CROSS JOIN q
        WHERE c.fts @@ q.tsq OR similarity(c.content, p_query) > 0.12
    )
    SELECT * FROM (
        SELECT * FROM fact_hits
        UNION ALL
        SELECT * FROM chunk_hits
    ) hits
    ORDER BY rank DESC
    LIMIT greatest(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.search_knowledge(TEXT, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_knowledge(TEXT, INTEGER) TO authenticated, service_role;
