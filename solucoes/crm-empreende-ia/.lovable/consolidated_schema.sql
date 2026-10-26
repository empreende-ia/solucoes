-- ============================================================
-- CRM Imobiliário — Consolidated Initial Schema for Remix
-- ============================================================
-- INSTRUCTIONS:
-- 1. Remix the project
-- 2. Delete ALL files in supabase/migrations/
-- 3. Place this file as supabase/migrations/00000000000000_initial_schema.sql
-- 4. The new project will have a clean database on first deploy
-- ============================================================

-- 1. TYPES / ENUMS
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.contact_status AS ENUM ('lead', 'prospect', 'customer', 'churned');
CREATE TYPE public.deal_status AS ENUM ('open', 'won', 'lost');
CREATE TYPE public.activity_type AS ENUM ('call', 'email', 'meeting', 'note', 'task');

-- 2. CORE TABLES

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  title TEXT,
  timezone TEXT DEFAULT 'UTC',
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'member',
  UNIQUE(user_id, org_id)
);

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size TEXT,
  revenue NUMERIC,
  website TEXT,
  linkedin_url TEXT,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  linkedin_url TEXT,
  avatar_url TEXT,
  status contact_status DEFAULT 'lead',
  lead_score INTEGER DEFAULT 0,
  owner_id UUID REFERENCES auth.users(id),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT DEFAULT 'BRL',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  win_probability NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  stage_id UUID REFERENCES public.pipeline_stages(id),
  contact_id UUID REFERENCES public.contacts(id),
  company_id UUID REFERENCES public.companies(id),
  owner_id UUID REFERENCES auth.users(id),
  close_date DATE,
  probability NUMERIC DEFAULT 0,
  status deal_status DEFAULT 'open',
  loss_reason TEXT,
  qualification JSONB DEFAULT '{"budget": null, "authority": null, "need": null, "timeline": null, "budget_notes": "", "authority_notes": "", "need_notes": "", "timeline_notes": ""}'::jsonb,
  qualification_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  contact_id UUID REFERENCES public.contacts(id),
  deal_id UUID REFERENCES public.deals(id),
  company_id UUID REFERENCES public.companies(id),
  user_id UUID REFERENCES auth.users(id),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  UNIQUE(org_id, name)
);

CREATE TABLE public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE public.deal_tags (
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, tag_id)
);

CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  category TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id UUID,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  subject TEXT,
  body_html TEXT,
  from_email TEXT,
  to_emails JSONB DEFAULT '[]'::jsonb,
  cc_emails JSONB DEFAULT '[]'::jsonb,
  bcc_emails JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  thread_id TEXT,
  message_id TEXT,
  provider TEXT,
  is_read BOOLEAN DEFAULT false,
  snoozed_until TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.email_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  step_order INTEGER NOT NULL DEFAULT 0,
  delay_days INTEGER NOT NULL DEFAULT 0,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject TEXT,
  body_html TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.email_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  next_send_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.email_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL DEFAULT 'Padrão',
  html TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  provider TEXT NOT NULL,
  email_address TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.lead_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.lead_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  event_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  trigger JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions JSONB DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0
);

CREATE TABLE public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'success',
  trigger_payload JSONB,
  actions_result JSONB,
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT now(),
  duration_ms INTEGER
);

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  request_count INTEGER DEFAULT 0
);

CREATE TABLE public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0
);

CREATE TABLE public.integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now(),
  connected_by UUID,
  UNIQUE(org_id, provider)
);

CREATE TABLE public.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  visitor_id TEXT,
  event_type TEXT NOT NULL DEFAULT 'pageview',
  page_url TEXT,
  page_title TEXT,
  referrer TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  options JSONB DEFAULT '[]',
  is_required BOOLEAN DEFAULT false,
  show_in_table BOOLEAN DEFAULT true,
  show_in_card BOOLEAN DEFAULT true,
  field_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, entity_type, field_key)
);

CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.team_members (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  daily_summary BOOLEAN DEFAULT true,
  daily_summary_hour INTEGER DEFAULT 9,
  notify_deal_won BOOLEAN DEFAULT true,
  notify_deal_lost BOOLEAN DEFAULT true,
  notify_task_overdue BOOLEAN DEFAULT true,
  notify_mention BOOLEAN DEFAULT true,
  notify_assignment BOOLEAN DEFAULT true,
  email_daily_summary BOOLEAN DEFAULT true,
  email_deal_won BOOLEAN DEFAULT false,
  email_task_overdue BOOLEAN DEFAULT false,
  UNIQUE(user_id, org_id)
);

CREATE TABLE public.loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.risk_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'inactivity',
  threshold_days INTEGER NOT NULL DEFAULT 7,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  applies_to TEXT NOT NULL DEFAULT 'deals',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_configured BOOLEAN DEFAULT false,
  pipeline_created BOOLEAN DEFAULT false,
  contact_created BOOLEAN DEFAULT false,
  deal_created BOOLEAN DEFAULT false,
  member_invited BOOLEAN DEFAULT false,
  email_connected BOOLEAN DEFAULT false,
  demo_loaded BOOLEAN DEFAULT false,
  completed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.org_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, key_name)
);

CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  permission TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, role, permission)
);

CREATE TABLE public.sales_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL DEFAULT 'revenue',
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  assign_type TEXT NOT NULL DEFAULT 'individual',
  user_id UUID,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  profile_pic_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  mode TEXT NOT NULL DEFAULT 'ai',
  assigned_to UUID,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  instance_id UUID,
  instance_name TEXT
);

CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  evolution_id TEXT UNIQUE,
  direction TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  media_mime TEXT,
  caption TEXT,
  is_ai BOOLEAN NOT NULL DEFAULT false,
  ai_model TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  quoted_msg_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  system_prompt TEXT NOT NULL DEFAULT '',
  fallback_msg TEXT NOT NULL DEFAULT 'Aguarde, um de nossos atendentes irá lhe ajudar em breve.',
  auto_create_lead BOOLEAN NOT NULL DEFAULT true,
  lead_pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  lead_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  response_delay_ms INTEGER NOT NULL DEFAULT 1500,
  max_ai_turns INTEGER NOT NULL DEFAULT 10,
  off_hours_msg TEXT NOT NULL DEFAULT '',
  working_hours JSONB NOT NULL DEFAULT '{"start":"08:00","end":"18:00","days":[1,2,3,4,5]}'::jsonb,
  quick_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_quick_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '⚡',
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_index INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6d28d9'
);

CREATE TABLE public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  server_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  qrcode_base64 TEXT,
  qr_code TEXT,
  instance_id_external TEXT,
  provider_type TEXT NOT NULL DEFAULT 'evolution_self_hosted',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, instance_name)
);

ALTER TABLE public.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_instance_id_fkey
  FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

CREATE TABLE public.whatsapp_instance_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.google_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- FUNCTIONS

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT org_id FROM public.profiles WHERE id = _user_id $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _org_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND org_id = _org_id) $$;

CREATE OR REPLACE FUNCTION public.create_organization_for_user(
  p_user_id UUID, p_name TEXT, p_slug TEXT, p_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name, slug, settings)
  VALUES (p_name, p_slug, p_settings)
  RETURNING id INTO v_org_id;
  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (p_user_id, v_org_id, 'owner');
  UPDATE public.profiles SET org_id = v_org_id WHERE id = p_user_id;
  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_org_owner(p_org_id UUID, p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND org_id = p_org_id AND role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (p_user_id, p_org_id, 'owner');
  END IF;
  UPDATE public.profiles SET org_id = p_org_id WHERE id = p_user_id AND org_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_user_name TEXT;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (NEW.id, NEW.email, v_user_name, NEW.raw_user_meta_data->>'avatar_url');
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, settings)
    VALUES ('Minha Empresa', 'minha-empresa', '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
    RETURNING id INTO v_org_id;
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (NEW.id, v_org_id, 'owner');
  ELSE
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (NEW.id, v_org_id, 'member');
  END IF;
  UPDATE public.profiles SET org_id = v_org_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- TRIGGER
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- UPDATE TRIGGERS
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_google_oauth_tokens_updated_at BEFORE UPDATE ON public.google_oauth_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ENABLE RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_quick_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instance_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
CREATE POLICY "Users can view own org" ON public.organizations FOR SELECT USING (user_belongs_to_org(auth.uid(), id));
CREATE POLICY "Owners can update org" ON public.organizations FOR UPDATE USING (has_role(auth.uid(), id, 'owner'));
CREATE POLICY "Authenticated can create org" ON public.organizations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view profiles in own org" ON public.profiles FOR SELECT USING (org_id IS NULL OR user_belongs_to_org(auth.uid(), org_id) OR id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Users can view roles in own org" ON public.user_roles FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Owners can insert roles" ON public.user_roles FOR INSERT WITH CHECK (has_role(auth.uid(), org_id, 'owner'));
CREATE POLICY "Owners can update roles" ON public.user_roles FOR UPDATE USING (has_role(auth.uid(), org_id, 'owner'));
CREATE POLICY "Owners can delete roles" ON public.user_roles FOR DELETE USING (has_role(auth.uid(), org_id, 'owner'));
CREATE POLICY "Org members can view contacts" ON public.contacts FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert contacts" ON public.contacts FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update contacts" ON public.contacts FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete contacts" ON public.contacts FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view companies" ON public.companies FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert companies" ON public.companies FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update companies" ON public.companies FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete companies" ON public.companies FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view pipelines" ON public.pipelines FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert pipelines" ON public.pipelines FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update pipelines" ON public.pipelines FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete pipelines" ON public.pipelines FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view stages" ON public.pipeline_stages FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert stages" ON public.pipeline_stages FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update stages" ON public.pipeline_stages FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete stages" ON public.pipeline_stages FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view deals" ON public.deals FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert deals" ON public.deals FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update deals" ON public.deals FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete deals" ON public.deals FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view activities" ON public.activities FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert activities" ON public.activities FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update activities" ON public.activities FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete activities" ON public.activities FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view tags" ON public.tags FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert tags" ON public.tags FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update tags" ON public.tags FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete tags" ON public.tags FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view contact tags" ON public.contact_tags FOR SELECT USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND user_belongs_to_org(auth.uid(), c.org_id)));
CREATE POLICY "Org members can insert contact tags" ON public.contact_tags FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND user_belongs_to_org(auth.uid(), c.org_id)));
CREATE POLICY "Org members can delete contact tags" ON public.contact_tags FOR DELETE USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND user_belongs_to_org(auth.uid(), c.org_id)));
CREATE POLICY "Org members can view deal tags" ON public.deal_tags FOR SELECT USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_tags.deal_id AND user_belongs_to_org(auth.uid(), d.org_id)));
CREATE POLICY "Org members can insert deal tags" ON public.deal_tags FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_tags.deal_id AND user_belongs_to_org(auth.uid(), d.org_id)));
CREATE POLICY "Org members can delete deal tags" ON public.deal_tags FOR DELETE USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_tags.deal_id AND user_belongs_to_org(auth.uid(), d.org_id)));
CREATE POLICY "Org members can view invitations" ON public.invitations FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Admins can insert invitations" ON public.invitations FOR INSERT WITH CHECK (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can delete invitations" ON public.invitations FOR DELETE USING (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Org members can view email templates" ON public.email_templates FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert email templates" ON public.email_templates FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update email templates" ON public.email_templates FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete email templates" ON public.email_templates FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view emails" ON public.emails FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert emails" ON public.emails FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update emails" ON public.emails FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete emails" ON public.emails FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view sequences" ON public.email_sequences FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert sequences" ON public.email_sequences FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update sequences" ON public.email_sequences FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete sequences" ON public.email_sequences FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view sequence steps" ON public.email_sequence_steps FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert sequence steps" ON public.email_sequence_steps FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update sequence steps" ON public.email_sequence_steps FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete sequence steps" ON public.email_sequence_steps FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view enrollments" ON public.email_sequence_enrollments FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert enrollments" ON public.email_sequence_enrollments FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update enrollments" ON public.email_sequence_enrollments FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete enrollments" ON public.email_sequence_enrollments FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Users can view own signatures" ON public.email_signatures FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own signatures" ON public.email_signatures FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own signatures" ON public.email_signatures FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own signatures" ON public.email_signatures FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Users can view own connections" ON public.email_connections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own connections" ON public.email_connections FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own connections" ON public.email_connections FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own connections" ON public.email_connections FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Org members can view scoring rules" ON public.lead_scoring_rules FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert scoring rules" ON public.lead_scoring_rules FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update scoring rules" ON public.lead_scoring_rules FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete scoring rules" ON public.lead_scoring_rules FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view score history" ON public.lead_score_history FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert score history" ON public.lead_score_history FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view segments" ON public.segments FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert segments" ON public.segments FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update segments" ON public.segments FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete segments" ON public.segments FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view automations" ON public.automations FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert automations" ON public.automations FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update automations" ON public.automations FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete automations" ON public.automations FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view automation logs" ON public.automation_logs FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert automation logs" ON public.automation_logs FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org owners can manage api keys" ON public.api_keys FOR ALL USING (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Org members can manage webhooks" ON public.webhooks FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can manage integrations" ON public.integration_configs FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view tracking events" ON public.tracking_events FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Public can insert tracking events" ON public.tracking_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Org members can manage custom fields" ON public.custom_field_definitions FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can manage teams" ON public.teams FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can manage team members" ON public.team_members FOR ALL USING (EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND user_belongs_to_org(auth.uid(), t.org_id)));
CREATE POLICY "Users can manage own notification prefs" ON public.notification_preferences FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Org members can manage loss reasons" ON public.loss_reasons FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view risk rules" ON public.risk_rules FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert risk rules" ON public.risk_rules FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update risk rules" ON public.risk_rules FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete risk rules" ON public.risk_rules FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Users manage own onboarding" ON public.onboarding_progress FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Org members can view role permissions" ON public.role_permissions FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Admins can insert role permissions" ON public.role_permissions FOR INSERT WITH CHECK (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can update role permissions" ON public.role_permissions FOR UPDATE USING (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can delete role permissions" ON public.role_permissions FOR DELETE USING (has_role(auth.uid(), org_id, 'owner') OR has_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Org members can view sales goals" ON public.sales_goals FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert sales goals" ON public.sales_goals FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update sales goals" ON public.sales_goals FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete sales goals" ON public.sales_goals FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view whatsapp conversations" ON public.whatsapp_conversations FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert whatsapp conversations" ON public.whatsapp_conversations FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update whatsapp conversations" ON public.whatsapp_conversations FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete whatsapp conversations" ON public.whatsapp_conversations FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view whatsapp messages" ON public.whatsapp_messages FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert whatsapp messages" ON public.whatsapp_messages FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update whatsapp messages" ON public.whatsapp_messages FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete whatsapp messages" ON public.whatsapp_messages FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view whatsapp ai config" ON public.whatsapp_ai_config FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert whatsapp ai config" ON public.whatsapp_ai_config FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update whatsapp ai config" ON public.whatsapp_ai_config FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete whatsapp ai config" ON public.whatsapp_ai_config FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view whatsapp quick actions" ON public.whatsapp_quick_actions FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert whatsapp quick actions" ON public.whatsapp_quick_actions FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update whatsapp quick actions" ON public.whatsapp_quick_actions FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete whatsapp quick actions" ON public.whatsapp_quick_actions FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can view instances" ON public.whatsapp_instances FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert instances" ON public.whatsapp_instances FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update instances" ON public.whatsapp_instances FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete instances" ON public.whatsapp_instances FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "No direct user access to instance secrets" ON public.whatsapp_instance_secrets FOR SELECT USING (false);
CREATE POLICY "Users can view own tokens" ON public.google_oauth_tokens FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own tokens" ON public.google_oauth_tokens FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own tokens" ON public.google_oauth_tokens FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own tokens" ON public.google_oauth_tokens FOR DELETE USING (user_id = auth.uid());

-- INDEXES
CREATE INDEX idx_contacts_org ON public.contacts(org_id);
CREATE INDEX idx_companies_org ON public.companies(org_id);
CREATE INDEX idx_deals_stage ON public.deals(stage_id);
CREATE INDEX idx_deals_org ON public.deals(org_id);
CREATE INDEX idx_activities_due ON public.activities(due_date) WHERE completed_at IS NULL;
CREATE INDEX idx_activities_org ON public.activities(org_id);
CREATE INDEX idx_emails_org_id ON public.emails(org_id);
CREATE INDEX idx_emails_contact_id ON public.emails(contact_id);
CREATE INDEX idx_emails_deal_id ON public.emails(deal_id);
CREATE INDEX idx_emails_status ON public.emails(status);
CREATE INDEX idx_score_history_contact ON public.lead_score_history(contact_id);
CREATE INDEX idx_automation_logs_automation ON public.automation_logs(automation_id);
CREATE INDEX idx_automation_logs_org ON public.automation_logs(org_id, executed_at DESC);
CREATE INDEX idx_api_keys_org ON public.api_keys(org_id);
CREATE INDEX idx_webhooks_org ON public.webhooks(org_id);
CREATE INDEX idx_integration_configs_org ON public.integration_configs(org_id);
CREATE INDEX idx_tracking_events_org ON public.tracking_events(org_id, created_at DESC);
CREATE INDEX idx_tracking_events_visitor ON public.tracking_events(visitor_id);
CREATE INDEX idx_custom_fields_org ON public.custom_field_definitions(org_id, entity_type);
CREATE INDEX idx_teams_org ON public.teams(org_id);
CREATE INDEX idx_loss_reasons_org ON public.loss_reasons(org_id);
CREATE INDEX idx_audit_logs_org_created ON public.audit_logs(org_id, created_at DESC);
CREATE INDEX idx_risk_rules_org_id ON public.risk_rules(org_id);
CREATE INDEX idx_sales_goals_org ON public.sales_goals(org_id);
CREATE INDEX idx_sales_goals_period ON public.sales_goals(org_id, period_year, period_month);
CREATE INDEX idx_whatsapp_conversations_org ON public.whatsapp_conversations(org_id);
CREATE INDEX idx_whatsapp_conversations_phone ON public.whatsapp_conversations(org_id, phone_number);
CREATE INDEX idx_whatsapp_conversations_last_msg ON public.whatsapp_conversations(org_id, last_message_at DESC);
CREATE INDEX idx_whatsapp_messages_conv ON public.whatsapp_messages(conversation_id, sent_at DESC);
CREATE INDEX idx_whatsapp_messages_org ON public.whatsapp_messages(org_id);
CREATE INDEX idx_whatsapp_quick_actions_org ON public.whatsapp_quick_actions(org_id, order_index);

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;

-- STORAGE
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload whatsapp media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Public can read whatsapp media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Users can delete own whatsapp media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'whatsapp-media' AND (storage.foldername(name))[1] = auth.uid()::text);
