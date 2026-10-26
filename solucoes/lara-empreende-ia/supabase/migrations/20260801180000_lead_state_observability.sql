-- Estado estruturado do lead sem duplicar contacts.client_memory e trilha de
-- observabilidade amigável por workspace/versão.

ALTER TABLE public.contacts
    ALTER COLUMN client_memory SET DEFAULT '{
      "last_updated": null,
      "lead_profile": {"interests": [], "lead_stage": "new", "objections": [], "products_discussed": [], "communication_style": "unknown", "qualification_score": 0},
      "sales_intelligence": {"pain_points": [], "next_best_action": "qualify", "budget_indication": "unknown", "decision_timeline": "unknown"},
      "lead_state": {
        "company": {"value": null, "status": "unknown"},
        "role": {"value": null, "status": "unknown"},
        "primary_pain": {"value": null, "status": "unknown"},
        "previous_attempts": {"value": null, "status": "unknown"},
        "desired_outcome": {"value": null, "status": "unknown"},
        "urgency": {"value": null, "status": "unknown"},
        "offering_interest": {"value": null, "status": "unknown"},
        "stage": {"value": "new", "status": "confirmed"},
        "next_best_action": {"value": "qualify", "status": "inferred"},
        "handoff_requested": false,
        "opt_out": false,
        "conversation_summary": "",
        "custom_fields": {}
      },
      "interaction_summary": {"response_pattern": "unknown", "last_contact_reason": "", "total_conversations": 0, "preferred_contact_time": "unknown"},
      "conversation_history": []
    }'::jsonb;

UPDATE public.contacts
SET client_memory = COALESCE(client_memory, '{}'::jsonb) || jsonb_build_object(
    'lead_state', jsonb_build_object(
        'company', jsonb_build_object('value', NULL, 'status', 'unknown'),
        'role', jsonb_build_object('value', NULL, 'status', 'unknown'),
        'primary_pain', jsonb_build_object('value', NULL, 'status', 'unknown'),
        'previous_attempts', jsonb_build_object('value', NULL, 'status', 'unknown'),
        'desired_outcome', jsonb_build_object('value', NULL, 'status', 'unknown'),
        'urgency', jsonb_build_object('value', NULL, 'status', 'unknown'),
        'offering_interest', jsonb_build_object('value', NULL, 'status', 'unknown'),
        'stage', jsonb_build_object(
            'value', COALESCE(client_memory #>> '{lead_profile,lead_stage}', 'new'),
            'status', 'confirmed'
        ),
        'next_best_action', jsonb_build_object(
            'value', COALESCE(client_memory #>> '{sales_intelligence,next_best_action}', 'qualify'),
            'status', 'inferred'
        ),
        'handoff_requested', COALESCE((client_memory ->> 'handoff_requested')::boolean, false),
        'opt_out', COALESCE((client_memory ->> 'opt_out')::boolean, false),
        'conversation_summary', COALESCE(client_memory ->> 'conversation_summary', ''),
        'custom_fields', COALESCE(client_memory -> 'custom_fields', '{}'::jsonb)
    ) || COALESCE(client_memory -> 'lead_state', '{}'::jsonb)
)
WHERE NOT (COALESCE(client_memory, '{}'::jsonb) ? 'lead_state');

CREATE TABLE public.agent_runtime_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
    agent_version_id UUID NOT NULL REFERENCES public.agent_versions(id) ON DELETE RESTRICT,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('response', 'handoff', 'error')),
    compiler_version TEXT NOT NULL,
    model_provider TEXT,
    model_name TEXT,
    route TEXT,
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    guards JSONB NOT NULL DEFAULT '[]'::jsonb,
    latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    estimated_cost NUMERIC,
    handoff BOOLEAN NOT NULL DEFAULT false,
    error_code TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_runtime_events_workspace_created_idx
    ON public.agent_runtime_events (workspace_id, created_at DESC);
CREATE INDEX agent_runtime_events_version_created_idx
    ON public.agent_runtime_events (agent_version_id, created_at DESC);
CREATE INDEX agent_runtime_events_conversation_idx
    ON public.agent_runtime_events (conversation_id, created_at DESC);

CREATE TRIGGER agent_runtime_events_are_immutable
    BEFORE UPDATE OR DELETE ON public.agent_runtime_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_agent_record_mutation();

ALTER TABLE public.agent_runtime_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_runtime_events_workspace_read ON public.agent_runtime_events
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

REVOKE ALL ON public.agent_runtime_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_runtime_events TO authenticated;
GRANT ALL ON public.agent_runtime_events TO service_role;
