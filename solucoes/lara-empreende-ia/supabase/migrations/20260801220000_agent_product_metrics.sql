-- Product telemetry for the governed setup flow. Events share the immutable
-- audit trail so they inherit tenant isolation and append-only guarantees.

CREATE OR REPLACE FUNCTION public.record_agent_product_event(
    _agent_id UUID,
    _event TEXT,
    _step TEXT DEFAULT NULL,
    _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_agent public.agents;
    allowed_events CONSTANT TEXT[] := ARRAY[
        'setup_started',
        'setup_step_viewed',
        'setup_proposal_generated',
        'setup_applied',
        'setup_abandoned'
    ];
BEGIN
    SELECT * INTO target_agent FROM public.agents WHERE id = _agent_id;
    IF target_agent.id IS NULL OR NOT public.can_edit_agent(target_agent.workspace_id) THEN
        RAISE EXCEPTION 'Agente não encontrada ou sem permissão' USING ERRCODE = '42501';
    END IF;
    IF NOT (_event = ANY(allowed_events)) THEN
        RAISE EXCEPTION 'Evento de produto inválido';
    END IF;
    IF _step IS NOT NULL AND (length(_step) = 0 OR length(_step) > 80) THEN
        RAISE EXCEPTION 'Etapa inválida';
    END IF;
    IF jsonb_typeof(COALESCE(_metadata, '{}'::jsonb)) <> 'object'
       OR octet_length(COALESCE(_metadata, '{}'::jsonb)::text) > 8192 THEN
        RAISE EXCEPTION 'Metadados inválidos ou acima do limite';
    END IF;

    INSERT INTO public.agent_audit_log (
        workspace_id, agent_id, actor_user_id, action, entity_type, entity_id, metadata
    ) VALUES (
        target_agent.workspace_id,
        target_agent.id,
        auth.uid(),
        'agent.product.' || _event,
        'agent',
        target_agent.id,
        COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object('step', _step)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_agent_product_event(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_agent_product_event(UUID, TEXT, TEXT, JSONB) TO authenticated;

