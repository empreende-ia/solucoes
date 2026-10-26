-- Grava documento + índice em uma única transação e aplica limite durável à
-- ingestão. Falha de rede ou de chunk nunca deixa uma fonte aprovada pela metade.

CREATE OR REPLACE FUNCTION public.enforce_knowledge_ingestion_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    subject TEXT;
BEGIN
    subject := COALESCE(auth.uid()::TEXT, 'service-role');
    IF NOT public.consume_agent_rate_limit(
        NEW.workspace_id,
        subject,
        'knowledge_ingestion',
        40,
        3600
    ) THEN
        RAISE EXCEPTION 'Limite de materiais atingido. Aguarde antes de enviar novos arquivos.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_knowledge_ingestion_rate_limit_before_insert
    ON public.knowledge_documents;
CREATE TRIGGER enforce_knowledge_ingestion_rate_limit_before_insert
    BEFORE INSERT ON public.knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION public.enforce_knowledge_ingestion_rate_limit();

CREATE OR REPLACE FUNCTION public.write_knowledge_document(
    _document_id UUID,
    _title TEXT,
    _content TEXT,
    _doc_type TEXT,
    _source_url TEXT,
    _fingerprint TEXT,
    _status TEXT,
    _is_active BOOLEAN,
    _ingestion_report JSONB,
    _error_message TEXT,
    _chunks TEXT[]
)
RETURNS public.knowledge_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    workspace UUID := public.current_workspace_id();
    document public.knowledge_documents;
    new_chunk_count INTEGER := COALESCE(array_length(_chunks, 1), 0);
BEGIN
    IF workspace IS NULL OR NOT public.can_edit_agent(workspace) THEN
        RAISE EXCEPTION 'Sem permissão para gerenciar materiais' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(char_length(trim(_title)), 0) = 0 THEN
        RAISE EXCEPTION 'O título do material é obrigatório' USING ERRCODE = '22023';
    END IF;
    IF char_length(COALESCE(_content, '')) > 220000 OR new_chunk_count > 500 THEN
        RAISE EXCEPTION 'O material ultrapassa o limite de ingestão' USING ERRCODE = '22023';
    END IF;
    IF _doc_type NOT IN ('texto', 'faq', 'url')
       OR _status NOT IN ('processing', 'approved', 'needs_review', 'error', 'archived') THEN
        RAISE EXCEPTION 'Tipo ou status de material inválido' USING ERRCODE = '22023';
    END IF;

    IF _document_id IS NULL THEN
        SELECT * INTO document
          FROM public.knowledge_documents d
         WHERE d.workspace_id = workspace
           AND d.fingerprint = _fingerprint
         LIMIT 1;
        IF document.id IS NOT NULL THEN
            RETURN document;
        END IF;

        BEGIN
            INSERT INTO public.knowledge_documents (
                workspace_id, title, content, doc_type, source_url, fingerprint,
                status, is_active, ingestion_report, error_message, chunk_count
            ) VALUES (
                workspace, trim(_title), COALESCE(_content, ''), _doc_type,
                NULLIF(trim(COALESCE(_source_url, '')), ''), _fingerprint,
                _status, _is_active, COALESCE(_ingestion_report, '{}'::JSONB),
                NULLIF(trim(COALESCE(_error_message, '')), ''), new_chunk_count
            ) RETURNING * INTO document;
        EXCEPTION WHEN unique_violation THEN
            SELECT * INTO document
              FROM public.knowledge_documents d
             WHERE d.workspace_id = workspace AND d.fingerprint = _fingerprint
             LIMIT 1;
            RETURN document;
        END;
    ELSE
        SELECT * INTO document
          FROM public.knowledge_documents d
         WHERE d.id = _document_id AND d.workspace_id = workspace
         FOR UPDATE;
        IF document.id IS NULL THEN
            RAISE EXCEPTION 'Material não encontrado' USING ERRCODE = 'P0002';
        END IF;

        UPDATE public.knowledge_documents
           SET title = trim(_title),
               content = COALESCE(_content, ''),
               doc_type = _doc_type,
               source_url = NULLIF(trim(COALESCE(_source_url, '')), ''),
               fingerprint = _fingerprint,
               status = _status,
               is_active = _is_active,
               ingestion_report = COALESCE(_ingestion_report, '{}'::JSONB),
               error_message = NULLIF(trim(COALESCE(_error_message, '')), ''),
               chunk_count = new_chunk_count
         WHERE id = document.id
         RETURNING * INTO document;

        DELETE FROM public.knowledge_chunks WHERE document_id = document.id;
    END IF;

    IF new_chunk_count > 0 THEN
        INSERT INTO public.knowledge_chunks (workspace_id, document_id, chunk_index, content)
        SELECT workspace, document.id, ordinal - 1, content
          FROM unnest(_chunks) WITH ORDINALITY AS chunks(content, ordinal);
    END IF;

    INSERT INTO public.agent_audit_log (
        workspace_id, agent_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    SELECT workspace, a.id, auth.uid(),
           CASE WHEN _document_id IS NULL THEN 'agent.knowledge_document_created'
                ELSE 'agent.knowledge_document_updated' END,
           'knowledge_document', document.id,
           jsonb_build_object('status', _status, 'chunk_count', new_chunk_count, 'doc_type', _doc_type)
      FROM public.agents a
     WHERE a.workspace_id = workspace;

    RETURN document;
END;
$$;

REVOKE ALL ON FUNCTION public.write_knowledge_document(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, TEXT, TEXT[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_knowledge_document(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, TEXT, TEXT[]
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_knowledge_ingestion_rate_limit() FROM PUBLIC, anon, authenticated;
