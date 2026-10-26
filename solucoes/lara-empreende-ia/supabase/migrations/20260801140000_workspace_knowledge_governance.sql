-- Evolui a base já existente para conhecimento governado e isolado por
-- workspace. Mantém os dados atuais e endurece toda leitura/escrita futura.

ALTER TABLE public.knowledge_facts
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD COLUMN title TEXT,
    ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('draft', 'confirmed', 'needs_review', 'expired', 'archived')),
    ADD COLUMN confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN confirmed_at TIMESTAMPTZ,
    ADD COLUMN valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN expires_at TIMESTAMPTZ;

ALTER TABLE public.knowledge_documents
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD COLUMN source_url TEXT,
    ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('processing', 'approved', 'needs_review', 'error', 'archived')),
    ADD COLUMN ingestion_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN error_message TEXT;

ALTER TABLE public.knowledge_chunks
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.unanswered_questions
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'question'
        CHECK (kind IN ('question', 'conflict', 'unreadable_document', 'expired_fact')),
    ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- O produto atual tem um único workspace. O backfill é explícito e falha se
-- uma instalação sem workspace tentar aplicar esta migration.
UPDATE public.knowledge_facts
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at LIMIT 1)
WHERE workspace_id IS NULL;

UPDATE public.knowledge_documents
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at LIMIT 1)
WHERE workspace_id IS NULL;

UPDATE public.knowledge_chunks c
SET workspace_id = d.workspace_id
FROM public.knowledge_documents d
WHERE d.id = c.document_id AND c.workspace_id IS NULL;

UPDATE public.unanswered_questions
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at LIMIT 1)
WHERE workspace_id IS NULL;

ALTER TABLE public.knowledge_facts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.knowledge_documents ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.knowledge_chunks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.unanswered_questions ALTER COLUMN workspace_id SET NOT NULL;

UPDATE public.knowledge_facts
SET title = COALESCE(NULLIF(trim(question), ''), initcap(category)),
    confirmed_at = COALESCE(confirmed_at, created_at),
    status = CASE WHEN is_active THEN 'confirmed' ELSE 'archived' END
WHERE title IS NULL;

ALTER TABLE public.knowledge_facts ALTER COLUMN title SET NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_knowledge_fact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.title := COALESCE(
        NULLIF(trim(NEW.title), ''),
        NULLIF(trim(NEW.question), ''),
        initcap(NEW.category),
        'Informação confirmada'
    );
    IF NEW.status = 'confirmed' THEN
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
        NEW.confirmed_by := COALESCE(NEW.confirmed_by, auth.uid());
    END IF;
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
        NEW.status := 'expired';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER normalize_knowledge_fact_before_write
    BEFORE INSERT OR UPDATE ON public.knowledge_facts
    FOR EACH ROW EXECUTE FUNCTION public.normalize_knowledge_fact();

CREATE INDEX knowledge_facts_workspace_status_idx
    ON public.knowledge_facts (workspace_id, status, category, updated_at DESC);
CREATE INDEX knowledge_documents_workspace_status_idx
    ON public.knowledge_documents (workspace_id, status, updated_at DESC);
CREATE INDEX knowledge_chunks_workspace_idx
    ON public.knowledge_chunks (workspace_id, document_id, chunk_index);
CREATE INDEX unanswered_workspace_status_idx
    ON public.unanswered_questions (workspace_id, status, kind, created_at DESC);

DROP POLICY IF EXISTS "Authenticated can read knowledge_facts" ON public.knowledge_facts;
DROP POLICY IF EXISTS "Admins can manage knowledge_facts" ON public.knowledge_facts;
CREATE POLICY knowledge_facts_workspace_read ON public.knowledge_facts
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY knowledge_facts_workspace_write ON public.knowledge_facts
    FOR ALL TO authenticated
    USING (public.can_edit_agent(workspace_id))
    WITH CHECK (public.can_edit_agent(workspace_id));

DROP POLICY IF EXISTS "Authenticated can read knowledge_documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Admins can manage knowledge_documents" ON public.knowledge_documents;
CREATE POLICY knowledge_documents_workspace_read ON public.knowledge_documents
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY knowledge_documents_workspace_write ON public.knowledge_documents
    FOR ALL TO authenticated
    USING (public.can_edit_agent(workspace_id))
    WITH CHECK (public.can_edit_agent(workspace_id));

DROP POLICY IF EXISTS "Authenticated can read knowledge_chunks" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "Admins can manage knowledge_chunks" ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_workspace_read ON public.knowledge_chunks
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY knowledge_chunks_workspace_write ON public.knowledge_chunks
    FOR ALL TO authenticated
    USING (public.can_edit_agent(workspace_id))
    WITH CHECK (public.can_edit_agent(workspace_id));

DROP POLICY IF EXISTS "Authenticated can manage unanswered questions" ON public.unanswered_questions;
CREATE POLICY unanswered_workspace_read ON public.unanswered_questions
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY unanswered_workspace_write ON public.unanswered_questions
    FOR ALL TO authenticated
    USING (public.can_edit_agent(workspace_id))
    WITH CHECK (public.can_edit_agent(workspace_id));

CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT wm.workspace_id
    FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.status = 'active'
    ORDER BY wm.created_at
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.search_workspace_knowledge(
    _workspace_id UUID,
    p_query TEXT,
    p_limit INTEGER DEFAULT 6
)
RETURNS TABLE (source_type TEXT, source_id UUID, title TEXT, content TEXT, rank REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH q AS (SELECT websearch_to_tsquery('portuguese', p_query) AS tsq),
    fact_hits AS (
        SELECT 'fact'::TEXT AS source_type,
               f.id AS source_id,
               f.title,
               f.fact AS content,
               (COALESCE(ts_rank(f.fts, q.tsq), 0) * 2.0
                + similarity(coalesce(f.question, '') || ' ' || f.fact, p_query))::REAL AS rank
        FROM public.knowledge_facts f CROSS JOIN q
        WHERE f.workspace_id = _workspace_id
          AND f.status = 'confirmed' AND f.is_active
          AND f.valid_from <= now()
          AND (f.expires_at IS NULL OR f.expires_at > now())
          AND (f.fts @@ q.tsq OR similarity(coalesce(f.question, '') || ' ' || f.fact, p_query) > 0.12)
    ),
    chunk_hits AS (
        SELECT 'chunk'::TEXT AS source_type,
               c.id AS source_id,
               d.title,
               c.content,
               (COALESCE(ts_rank(c.fts, q.tsq), 0) + similarity(c.content, p_query) * 0.5)::REAL AS rank
        FROM public.knowledge_chunks c
        JOIN public.knowledge_documents d ON d.id = c.document_id
          AND d.workspace_id = _workspace_id AND d.status = 'approved' AND d.is_active
        CROSS JOIN q
        WHERE c.workspace_id = _workspace_id
          AND (c.fts @@ q.tsq OR similarity(c.content, p_query) > 0.12)
    )
    SELECT * FROM (SELECT * FROM fact_hits UNION ALL SELECT * FROM chunk_hits) hits
    ORDER BY rank DESC LIMIT greatest(p_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.search_knowledge(p_query TEXT, p_limit INTEGER DEFAULT 6)
RETURNS TABLE (source_type TEXT, source_id UUID, title TEXT, content TEXT, rank REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.search_workspace_knowledge(public.current_workspace_id(), p_query, p_limit);
$$;

REVOKE ALL ON FUNCTION public.current_workspace_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_workspace_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.search_workspace_knowledge(UUID, TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_workspace_knowledge(UUID, TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.search_knowledge(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_knowledge(TEXT, INTEGER) TO authenticated, service_role;
