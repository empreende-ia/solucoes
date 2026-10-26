-- Repetir o assistente ou reenviar a mesma fonte não pode criar cópias da
-- ingestão. O conteúdo normalizado é identificado no cliente antes do insert;
-- o índice também fecha a condição de corrida entre duas abas.

ALTER TABLE public.knowledge_documents
    ADD COLUMN fingerprint TEXT;

CREATE UNIQUE INDEX knowledge_documents_workspace_fingerprint_unique
    ON public.knowledge_documents (workspace_id, fingerprint)
    WHERE fingerprint IS NOT NULL;
