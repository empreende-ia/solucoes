-- Loop de treinamento: a pergunta que a Lara não soube responder deixa de ser
-- uma linha solta e vira uma pendência única, com contador de ocorrências,
-- quem resolveu, quando resolveu e a prova de que a agente passou a encontrar
-- a resposta.
--
-- Vocabulário do status: continua gravado como 'open' | 'resolved' | 'ignored'
-- (pendente | resolvida | descartada na interface). Trocar os valores no banco
-- quebraria supabase/functions/_shared/lara-engine.ts, supabase/functions/
-- prompt-insights/index.ts e src/services/knowledge.ts, que já leem e gravam
-- exatamente esses três — a tradução para o português mora na interface.
--
-- Nada de policy é derrubado aqui: unanswered_workspace_read (leitura por
-- membro do workspace) e unanswered_workspace_write (escrita por quem pode
-- editar a agente) continuam sendo o único caminho de acesso.

-- 1. Colunas do ciclo lacuna -> fato -> prova
ALTER TABLE public.unanswered_questions
    ADD COLUMN IF NOT EXISTS normalized_question TEXT,
    ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolution_proof JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.unanswered_questions'::regclass
          AND conname = 'unanswered_questions_occurrence_count_check'
    ) THEN
        ALTER TABLE public.unanswered_questions
            ADD CONSTRAINT unanswered_questions_occurrence_count_check
            CHECK (occurrence_count >= 1);
    END IF;
END $$;

COMMENT ON COLUMN public.unanswered_questions.normalized_question IS
    'Pergunta sem acento, sem pontuação e em minúsculas. Chave de agrupamento de perguntas equivalentes.';
COMMENT ON COLUMN public.unanswered_questions.occurrence_count IS
    'Quantos leads fizeram a mesma pergunta. Cada repetição soma aqui em vez de criar uma linha nova.';
COMMENT ON COLUMN public.unanswered_questions.resolution_proof IS
    'Resultado da busca rodada depois de aprovar o fato: se a agente passou a encontrar a resposta, e em que posição.';

-- 2. Normalização usada tanto no agrupamento quanto no dedupe
CREATE OR REPLACE FUNCTION public.normalize_unanswered_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT btrim(regexp_replace(
        regexp_replace(
            lower(translate(
                coalesce(p_text, ''),
                'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
            '[^a-z0-9 ]+', ' ', 'g'),
        '[ ]+', ' ', 'g'));
$$;

-- 3. Dedupe na entrada: a repetição soma no contador em vez de criar linha nova
CREATE OR REPLACE FUNCTION public.merge_unanswered_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key TEXT;
    v_existing public.unanswered_questions%ROWTYPE;
    v_occurrences JSONB;
BEGIN
    -- Autorização explícita antes de qualquer escrita privilegiada. Esta função
    -- é SECURITY DEFINER e o UPDATE abaixo não passa por RLS; o WITH CHECK da
    -- policy de escrita só é avaliado DEPOIS dos gatilhos BEFORE INSERT e nem
    -- chega a rodar quando devolvemos NULL. Sem esta guarda, um membro do
    -- workspace A poderia inserir com workspace_id do workspace B e alterar a
    -- pendência alheia sem erro nenhum. service_role (auth.uid() nulo) é o
    -- motor, que já escreve fora de RLS por definição.
    IF auth.uid() IS NOT NULL AND NOT public.can_edit_agent(NEW.workspace_id) THEN
        RAISE EXCEPTION 'Sem permissão para registrar pendência neste workspace.'
            USING ERRCODE = '42501';
    END IF;

    NEW.question := btrim(NEW.question);
    v_key := public.normalize_unanswered_text(NEW.question);
    NEW.normalized_question := v_key;
    NEW.occurrence_count := greatest(coalesce(NEW.occurrence_count, 1), 1);
    NEW.last_seen_at := coalesce(NEW.last_seen_at, now());

    IF v_key = '' OR NEW.status <> 'open' THEN
        RETURN NEW;
    END IF;

    -- Serializa por (workspace, tipo, pergunta normalizada). Sem isso, dois
    -- leads perguntando no mesmo segundo criariam duas linhas idênticas: o
    -- SELECT abaixo não tem o que travar quando a linha ainda não existe.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(NEW.workspace_id::TEXT || '|' || NEW.kind || '|' || v_key, 0));

    SELECT * INTO v_existing
    FROM public.unanswered_questions q
    WHERE q.workspace_id = NEW.workspace_id
      AND q.kind = NEW.kind
      AND q.status = 'open'
      AND q.normalized_question = v_key
    ORDER BY q.created_at
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Quem está esperando fica registrado: é essa lista que permite voltar aos
    -- leads depois. Guarda as 25 últimas — é material de trabalho, não log.
    v_occurrences := CASE
        WHEN jsonb_typeof(v_existing.metadata -> 'occurrences') = 'array'
            THEN v_existing.metadata -> 'occurrences'
        ELSE '[]'::jsonb
    END || jsonb_build_array(jsonb_build_object(
        'at', to_jsonb(coalesce(NEW.created_at, now())),
        'conversation_id', to_jsonb(NEW.conversation_id),
        'contact_id', to_jsonb(NEW.contact_id),
        'question', to_jsonb(NEW.question)));

    IF jsonb_array_length(v_occurrences) > 25 THEN
        SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
        INTO v_occurrences
        FROM (
            SELECT item, ord
            FROM jsonb_array_elements(v_occurrences) WITH ORDINALITY AS t(item, ord)
            ORDER BY ord DESC
            LIMIT 25
        ) recentes;
    END IF;

    UPDATE public.unanswered_questions
    SET occurrence_count = v_existing.occurrence_count + NEW.occurrence_count,
        last_seen_at = greatest(v_existing.last_seen_at, NEW.last_seen_at),
        conversation_id = coalesce(NEW.conversation_id, v_existing.conversation_id),
        contact_id = coalesce(NEW.contact_id, v_existing.contact_id),
        context = coalesce(nullif(btrim(NEW.context), ''), v_existing.context),
        metadata = jsonb_set(coalesce(v_existing.metadata, '{}'::jsonb), '{occurrences}', v_occurrences, true)
    WHERE id = v_existing.id;

    -- Devolver NULL cancela a inserção duplicada. O motor não precisa saber:
    -- ele insere igual e a pendência única cresce sozinha.
    RETURN NULL;
END;
$$;

-- 4. Carimbo da resolução: quem resolveu e quando, sem depender do cliente
CREATE OR REPLACE FUNCTION public.stamp_unanswered_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.question IS DISTINCT FROM OLD.question THEN
        NEW.normalized_question := public.normalize_unanswered_text(NEW.question);
    END IF;

    IF NEW.status = 'open' AND OLD.status <> 'open' THEN
        NEW.resolved_at := NULL;
        NEW.resolved_by := NULL;
        NEW.resolution_proof := '{}'::jsonb;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('resolved', 'ignored') THEN
        NEW.resolved_at := coalesce(NEW.resolved_at, now());
        NEW.resolved_by := coalesce(NEW.resolved_by, auth.uid());
    END IF;

    RETURN NEW;
END;
$$;

-- 5. Backfill conservador: nenhuma linha existente é apagada nem fundida (o
--    conversation_id de cada uma é o que liga a pendência ao lead que espera).
--    O agrupamento das antigas acontece na leitura, por normalized_question.
UPDATE public.unanswered_questions
SET normalized_question = public.normalize_unanswered_text(question),
    last_seen_at = created_at
WHERE normalized_question IS NULL;

DROP TRIGGER IF EXISTS merge_unanswered_question_before_insert ON public.unanswered_questions;
CREATE TRIGGER merge_unanswered_question_before_insert
    BEFORE INSERT ON public.unanswered_questions
    FOR EACH ROW EXECUTE FUNCTION public.merge_unanswered_question();

DROP TRIGGER IF EXISTS stamp_unanswered_resolution_before_update ON public.unanswered_questions;
CREATE TRIGGER stamp_unanswered_resolution_before_update
    BEFORE UPDATE ON public.unanswered_questions
    FOR EACH ROW EXECUTE FUNCTION public.stamp_unanswered_resolution();

-- 6. Índices: o dedupe procura por (workspace, tipo, pergunta) entre as abertas;
--    a fila de trabalho ordena por quantos leads perguntaram.
CREATE INDEX IF NOT EXISTS unanswered_open_normalized_idx
    ON public.unanswered_questions (workspace_id, kind, normalized_question)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS unanswered_workspace_priority_idx
    ON public.unanswered_questions (workspace_id, status, occurrence_count DESC, last_seen_at DESC);

-- 7. Superfície mínima: as funções de trigger não são chamáveis pelo PostgREST.
REVOKE EXECUTE ON FUNCTION public.merge_unanswered_question() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_unanswered_resolution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_unanswered_text(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_unanswered_text(TEXT) TO authenticated, service_role;
