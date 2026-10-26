-- Publicação da configuração estruturada através de artefato compilado no
-- backend. O cliente não pode fornecer nem publicar o prompt diretamente.

ALTER TABLE public.agent_versions
    ADD COLUMN compiler_version TEXT NOT NULL DEFAULT 'legacy-v1';

CREATE INDEX agent_versions_compiler_idx
    ON public.agent_versions (agent_id, compiler_version, created_at DESC);

-- A função legada da Fase 1 permanece apenas para rastreabilidade da migration,
-- mas deixa de ser executável pelo cliente assim que o compilador entra em uso.
REVOKE ALL ON FUNCTION public.publish_agent_draft(UUID, INTEGER, UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.publish_compiled_agent_draft(
    _agent_id UUID,
    _expected_revision INTEGER,
    _compiled_prompt TEXT,
    _compiler_version TEXT,
    _actor_user_id UUID,
    _evaluation_run_id UUID DEFAULT NULL,
    _label TEXT DEFAULT NULL,
    _accepted_warnings JSONB DEFAULT '[]'::jsonb
)
RETURNS public.agent_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_agent public.agents;
    current_draft public.agent_drafts;
    new_version public.agent_versions;
    next_version_number INTEGER;
BEGIN
    SELECT a.*
      INTO target_agent
      FROM public.agents a
     WHERE a.id = _agent_id
     FOR UPDATE;

    IF target_agent.id IS NULL
       OR NOT public.can_publish_agent(target_agent.workspace_id, _actor_user_id) THEN
        RAISE EXCEPTION 'Sem permissão para publicar este agente'
            USING ERRCODE = '42501';
    END IF;

    IF NULLIF(trim(_compiled_prompt), '') IS NULL
       OR NULLIF(trim(_compiler_version), '') IS NULL THEN
        RAISE EXCEPTION 'Artefato compilado e versão do compilador são obrigatórios'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(_accepted_warnings) <> 'array' THEN
        RAISE EXCEPTION 'Alertas aceitos devem ser uma lista'
            USING ERRCODE = '22023';
    END IF;

    SELECT d.*
      INTO current_draft
      FROM public.agent_drafts d
     WHERE d.agent_id = _agent_id
     FOR UPDATE;

    IF current_draft.id IS NULL OR current_draft.revision <> _expected_revision THEN
        RAISE EXCEPTION 'O rascunho mudou antes da publicação'
            USING ERRCODE = '40001';
    END IF;

    SELECT COALESCE(MAX(v.version_number), 0) + 1
      INTO next_version_number
      FROM public.agent_versions v
     WHERE v.agent_id = _agent_id;

    INSERT INTO public.agent_versions (
        workspace_id,
        agent_id,
        version_number,
        config,
        compiled_prompt,
        compiler_version,
        checksum,
        label,
        source,
        evaluation_run_id,
        accepted_warnings,
        restored_from_version_id,
        created_by
    ) VALUES (
        target_agent.workspace_id,
        _agent_id,
        next_version_number,
        current_draft.config,
        _compiled_prompt,
        _compiler_version,
        md5(
            current_draft.config::text
            || E'\n' || _compiler_version
            || E'\n' || _compiled_prompt
        ),
        NULLIF(trim(_label), ''),
        CASE
            WHEN current_draft.base_version_id IS DISTINCT FROM target_agent.published_version_id
                THEN 'restoration'
            ELSE 'manual'
        END,
        _evaluation_run_id,
        _accepted_warnings,
        CASE
            WHEN current_draft.base_version_id IS DISTINCT FROM target_agent.published_version_id
                THEN current_draft.base_version_id
            ELSE NULL
        END,
        _actor_user_id
    ) RETURNING * INTO new_version;

    UPDATE public.agents
       SET published_version_id = new_version.id,
           status = 'active',
           name = COALESCE(
               NULLIF(trim(current_draft.config #>> '{identity,agentName}'), ''),
               name
           ),
           updated_by = _actor_user_id,
           updated_at = now()
     WHERE id = _agent_id;

    UPDATE public.agent_drafts
       SET base_version_id = new_version.id,
           updated_by = _actor_user_id,
           updated_at = now()
     WHERE id = current_draft.id;

    INSERT INTO public.agent_audit_log (
        workspace_id, agent_id, actor_user_id, action, entity_type, entity_id, metadata
    ) VALUES (
        target_agent.workspace_id,
        _agent_id,
        _actor_user_id,
        'agent.published',
        'agent_version',
        new_version.id,
        jsonb_build_object(
            'versionNumber', new_version.version_number,
            'revision', current_draft.revision,
            'compilerVersion', _compiler_version,
            'checksum', new_version.checksum,
            'evaluationRunId', _evaluation_run_id,
            'acceptedWarnings', _accepted_warnings,
            'evaluationGate', 'pending_phase_6'
        )
    );

    RETURN new_version;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_compiled_agent_draft(
    UUID, INTEGER, TEXT, TEXT, UUID, UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_compiled_agent_draft(
    UUID, INTEGER, TEXT, TEXT, UUID, UUID, TEXT, JSONB
) TO service_role;
