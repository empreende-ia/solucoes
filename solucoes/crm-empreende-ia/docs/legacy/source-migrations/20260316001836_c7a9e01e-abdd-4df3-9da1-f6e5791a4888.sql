
-- API Keys table
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz,
  is_active boolean DEFAULT true,
  request_count integer DEFAULT 0
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org owners can manage api keys" ON public.api_keys FOR ALL USING (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));

-- Webhooks outbound config
CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_triggered_at timestamptz,
  failure_count integer DEFAULT 0
);
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage webhooks" ON public.webhooks FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));

-- Integration configs (Slack, Google Calendar, WhatsApp, etc.)
CREATE TABLE public.integration_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  connected_at timestamptz DEFAULT now(),
  connected_by uuid,
  UNIQUE(org_id, provider)
);
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage integrations" ON public.integration_configs FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));

-- Tracking events from website snippet
CREATE TABLE public.tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  visitor_id text,
  event_type text NOT NULL DEFAULT 'pageview',
  page_url text,
  page_title text,
  referrer text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view tracking events" ON public.tracking_events FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Public can insert tracking events" ON public.tracking_events FOR INSERT WITH CHECK (true);

CREATE INDEX idx_api_keys_org ON public.api_keys(org_id);
CREATE INDEX idx_webhooks_org ON public.webhooks(org_id);
CREATE INDEX idx_integration_configs_org ON public.integration_configs(org_id);
CREATE INDEX idx_tracking_events_org ON public.tracking_events(org_id, created_at DESC);
CREATE INDEX idx_tracking_events_visitor ON public.tracking_events(visitor_id);
