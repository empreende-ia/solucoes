-- Google Calendar integration
-- Credentials are intentionally kept in a service-role-only table. The browser
-- reads the sanitized connection status through the google-calendar edge function.

CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'google' CHECK (provider = 'google'),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_email TEXT,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  sync_enabled BOOLEAN NOT NULL DEFAULT true,
  create_meet BOOLEAN NOT NULL DEFAULT true,
  time_zone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_integrations FROM anon, authenticated;
GRANT ALL ON public.calendar_integrations TO service_role;

DROP TRIGGER IF EXISTS update_calendar_integrations_updated_at ON public.calendar_integrations;
CREATE TRIGGER update_calendar_integrations_updated_at
  BEFORE UPDATE ON public.calendar_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.calendar_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_oauth_states FROM anon, authenticated;
GRANT ALL ON public.calendar_oauth_states TO service_role;
CREATE INDEX IF NOT EXISTS idx_calendar_oauth_states_expires_at
  ON public.calendar_oauth_states (expires_at);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS calendar_provider TEXT,
  ADD COLUMN IF NOT EXISTS external_calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS calendar_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_sync_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_calendar_sync_status_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_calendar_sync_status_check
      CHECK (calendar_sync_status IN ('not_connected', 'pending', 'synced', 'error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_external_calendar_event
  ON public.appointments (calendar_provider, external_calendar_event_id)
  WHERE external_calendar_event_id IS NOT NULL;

COMMENT ON TABLE public.calendar_integrations IS
  'Service-role-only OAuth credentials and settings for external calendars.';
COMMENT ON COLUMN public.appointments.external_calendar_event_id IS
  'Provider event id used to update or delete the same event without duplication.';
