-- Contrato de execução das ações da agente. A configuração continua no
-- snapshot versionado; esta migration governa efeitos reais e sua auditoria.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE RESTRICT;

UPDATE public.appointments appointment
SET workspace_id = (
    SELECT wm.workspace_id
    FROM public.workspace_members wm
    WHERE wm.user_id = appointment.user_id AND wm.status = 'active'
    ORDER BY wm.created_at
    LIMIT 1
)
WHERE appointment.workspace_id IS NULL;

UPDATE public.appointments
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at LIMIT 1)
WHERE workspace_id IS NULL;

ALTER TABLE public.appointments ALTER COLUMN workspace_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_appointment_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        SELECT wm.workspace_id INTO NEW.workspace_id
        FROM public.workspace_members wm
        WHERE wm.user_id = COALESCE(NEW.user_id, auth.uid())
          AND wm.status = 'active'
        ORDER BY wm.created_at
        LIMIT 1;
    END IF;
    IF NEW.workspace_id IS NULL THEN
        RAISE EXCEPTION 'Workspace não encontrado para o agendamento'
            USING ERRCODE = '23502';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER assign_appointment_workspace_before_write
    BEFORE INSERT OR UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.assign_appointment_workspace();

CREATE INDEX appointments_workspace_date_idx
    ON public.appointments (workspace_id, date, time, status);

ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_workspace_no_overlap
    EXCLUDE USING gist (
        workspace_id WITH =,
        tsrange(
            date + time,
            date + time + make_interval(mins => duration),
            '[)'
        ) WITH &&
    ) WHERE (status = 'scheduled');

DROP POLICY IF EXISTS "Allow all operations on appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can manage own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can access all appointments" ON public.appointments;
CREATE POLICY appointments_workspace_read ON public.appointments
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY appointments_workspace_write ON public.appointments
    FOR ALL TO authenticated
    USING (public.can_edit_agent(workspace_id))
    WITH CHECK (public.can_edit_agent(workspace_id));

CREATE TABLE public.agent_action_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    agent_version_id UUID REFERENCES public.agent_versions(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    action_key TEXT NOT NULL CHECK (action_key IN (
        'check_availability',
        'create_appointment',
        'reschedule_appointment',
        'cancel_appointment',
        'human_handoff',
        'register_opt_out'
    )),
    mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'simulation')),
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'failed', 'rejected')),
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX agent_action_runs_workspace_created_idx
    ON public.agent_action_runs (workspace_id, created_at DESC);
CREATE INDEX agent_action_runs_conversation_idx
    ON public.agent_action_runs (conversation_id, created_at DESC);

ALTER TABLE public.agent_action_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_action_runs_workspace_read ON public.agent_action_runs
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

REVOKE ALL ON public.agent_action_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_action_runs TO authenticated;
GRANT ALL ON public.agent_action_runs TO service_role;
