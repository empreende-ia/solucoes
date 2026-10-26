-- Sugestões derivadas de conversas reais. Elas nunca alteram a configuração
-- publicada: entram pendentes e exigem uma ação humana explícita.
CREATE TABLE public.agent_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL CHECK (suggestion_type IN (
        'new_fact', 'new_test_scenario', 'commercial_rule', 'tone_adjustment',
        'handoff_rule', 'missing_material'
    )),
    title TEXT NOT NULL,
    rationale TEXT NOT NULL,
    proposed_change JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    fingerprint TEXT NOT NULL,
    source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'applied')),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    applied_entity_type TEXT,
    applied_entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(proposed_change) = 'object'),
    CHECK (jsonb_typeof(evidence) = 'object'),
    UNIQUE (workspace_id, fingerprint)
);

CREATE INDEX agent_suggestions_workspace_status_idx
    ON public.agent_suggestions (workspace_id, status, created_at DESC);

CREATE TRIGGER update_agent_suggestions_updated_at
    BEFORE UPDATE ON public.agent_suggestions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.review_agent_suggestion(
    _suggestion_id UUID,
    _status TEXT,
    _applied_entity_type TEXT DEFAULT NULL,
    _applied_entity_id UUID DEFAULT NULL
)
RETURNS public.agent_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    suggestion public.agent_suggestions;
BEGIN
    IF _status NOT IN ('accepted', 'rejected', 'applied') THEN
        RAISE EXCEPTION 'Status de revisão inválido';
    END IF;
    SELECT * INTO suggestion FROM public.agent_suggestions WHERE id = _suggestion_id FOR UPDATE;
    IF suggestion.id IS NULL OR NOT public.can_edit_agent(suggestion.workspace_id) THEN
        RAISE EXCEPTION 'Sugestão não encontrada ou sem permissão' USING ERRCODE = '42501';
    END IF;
    IF suggestion.status <> 'pending' AND NOT (suggestion.status = 'accepted' AND _status = 'applied') THEN
        RAISE EXCEPTION 'Esta sugestão já foi revisada';
    END IF;
    UPDATE public.agent_suggestions
       SET status = _status,
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           applied_entity_type = _applied_entity_type,
           applied_entity_id = _applied_entity_id
     WHERE id = _suggestion_id
     RETURNING * INTO suggestion;
    INSERT INTO public.agent_audit_log (
        workspace_id, agent_id, actor_user_id, action, entity_type, entity_id, metadata
    ) VALUES (
        suggestion.workspace_id, suggestion.agent_id, auth.uid(),
        'agent.suggestion_reviewed', 'agent_suggestion', suggestion.id,
        jsonb_build_object('status', _status, 'appliedEntityType', _applied_entity_type, 'appliedEntityId', _applied_entity_id)
    );
    RETURN suggestion;
END;
$$;

ALTER TABLE public.agent_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_suggestions_workspace_read ON public.agent_suggestions
    FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

REVOKE ALL ON public.agent_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_suggestions TO authenticated;
GRANT ALL ON public.agent_suggestions TO service_role;
REVOKE ALL ON FUNCTION public.review_agent_suggestion(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_agent_suggestion(UUID, TEXT, TEXT, UUID) TO authenticated;
