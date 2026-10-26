
-- =========================================================
-- Onda 2 + 3 + Profissionais — tabelas faltantes
-- =========================================================

-- Helper trigger function (reuse touch_updated_at if exists)

-- ===== PROFESSIONALS =====
CREATE TABLE IF NOT EXISTS public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  specialty text,
  council text,           -- CRM, CRO, CRP, etc
  registration text,      -- registro do conselho
  bio text,
  avatar_url text,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access professionals" ON public.professionals
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
CREATE TRIGGER professionals_touch BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== PATIENT ↔ PROFESSIONAL =====
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS assigned_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.patient_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, professional_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_professionals TO authenticated;
GRANT ALL ON public.patient_professionals TO service_role;
ALTER TABLE public.patient_professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access patient_professionals" ON public.patient_professionals
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- ===== HEALTH GOALS =====
CREATE TABLE IF NOT EXISTS public.health_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  metric text,
  target_value numeric,
  current_value numeric,
  unit text,
  status text NOT NULL DEFAULT 'in_progress',
  due_date date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_goals TO authenticated;
GRANT ALL ON public.health_goals TO service_role;
ALTER TABLE public.health_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access health_goals" ON public.health_goals
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
CREATE TRIGGER health_goals_touch BEFORE UPDATE ON public.health_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== Generic permissive CRM tables (Onda 2) =====
-- contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name text,
  last_name text,
  email text,
  phone text,
  status text DEFAULT 'lead',
  lead_score numeric DEFAULT 0,
  avatar_url text,
  fonte text,
  imovel_interesse_id uuid,
  company_id uuid,
  tags text[] DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access contacts" ON public.contacts
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- companies
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  industry text,
  website text,
  phone text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access companies" ON public.companies
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- deals
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  title text NOT NULL,
  value numeric DEFAULT 0,
  currency text DEFAULT 'BRL',
  status text DEFAULT 'open',
  probability numeric DEFAULT 0,
  expected_close_date date,
  loss_reason_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access deals" ON public.deals
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- segments
CREATE TABLE IF NOT EXISTS public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.segments TO authenticated;
GRANT ALL ON public.segments TO service_role;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access segments" ON public.segments
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- custom_field_definitions
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity text NOT NULL DEFAULT 'contact',
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  field_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_field_definitions TO authenticated;
GRANT ALL ON public.custom_field_definitions TO service_role;
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access cfd" ON public.custom_field_definitions
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- loss_reasons
CREATE TABLE IF NOT EXISTS public.loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loss_reasons TO authenticated;
GRANT ALL ON public.loss_reasons TO service_role;
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access loss_reasons" ON public.loss_reasons
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- tags
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access tags" ON public.tags
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- risk_rules
CREATE TABLE IF NOT EXISTS public.risk_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_rules TO authenticated;
GRANT ALL ON public.risk_rules TO service_role;
ALTER TABLE public.risk_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access risk_rules" ON public.risk_rules
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channels jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User access own prefs" ON public.notification_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ===== Onda 3 =====

-- emails (mensagens/conversas)
CREATE TABLE IF NOT EXISTS public.emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_id uuid,
  deal_id uuid,
  company_id uuid,
  direction text NOT NULL DEFAULT 'inbound',
  subject text,
  body_html text,
  from_email text,
  to_emails text[] DEFAULT '{}',
  cc_emails text[] DEFAULT '{}',
  bcc_emails text[] DEFAULT '{}',
  status text DEFAULT 'received',
  open_count int NOT NULL DEFAULT 0,
  click_count int NOT NULL DEFAULT 0,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  thread_id text,
  message_id text,
  provider text,
  is_read boolean NOT NULL DEFAULT false,
  snoozed_until timestamptz,
  is_archived boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emails TO authenticated;
GRANT ALL ON public.emails TO service_role;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access emails" ON public.emails
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- automations
CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access automations" ON public.automations
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES public.automations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'success',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  executed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.automation_logs TO authenticated;
GRANT ALL ON public.automation_logs TO service_role;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read logs" ON public.automation_logs
  FOR SELECT TO authenticated USING (org_id = current_org_id());
CREATE POLICY "Service inserts logs" ON public.automation_logs
  FOR INSERT TO authenticated WITH CHECK (org_id = current_org_id());

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins read audit" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)));
CREATE POLICY "Members insert audit" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (org_id = current_org_id());

-- webhooks
CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_url text NOT NULL,
  event_types text[] DEFAULT '{}',
  secret text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins manage webhooks" ON public.webhooks
  FOR ALL TO authenticated
  USING (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)))
  WITH CHECK (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)));
CREATE POLICY "Org members read webhooks" ON public.webhooks
  FOR SELECT TO authenticated USING (org_id = current_org_id());

-- api_keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  key_prefix text,
  hashed_key text,
  scopes text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins manage api_keys" ON public.api_keys
  FOR ALL TO authenticated
  USING (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)))
  WITH CHECK (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)));

-- teams + members
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access teams" ON public.teams
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access team_members" ON public.team_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.org_id = current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.org_id = current_org_id()));

-- directorates
CREATE TABLE IF NOT EXISTS public.directorates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.directorates TO authenticated;
GRANT ALL ON public.directorates TO service_role;
ALTER TABLE public.directorates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access directorates" ON public.directorates
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

CREATE TABLE IF NOT EXISTS public.directorate_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directorate_id uuid NOT NULL REFERENCES public.directorates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (directorate_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.directorate_members TO authenticated;
GRANT ALL ON public.directorate_members TO service_role;
ALTER TABLE public.directorate_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access directorate_members" ON public.directorate_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.directorates d WHERE d.id = directorate_id AND d.org_id = current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.directorates d WHERE d.id = directorate_id AND d.org_id = current_org_id()));

-- invitations
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins manage invitations" ON public.invitations
  FOR ALL TO authenticated
  USING (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)))
  WITH CHECK (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)));

-- role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role, permission)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins manage perms" ON public.role_permissions
  FOR ALL TO authenticated
  USING (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)))
  WITH CHECK (org_id = current_org_id() AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role)));
CREATE POLICY "Org members read perms" ON public.role_permissions
  FOR SELECT TO authenticated USING (org_id = current_org_id());

-- user_roles.org_id
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- legados (imoveis, meta_ads_leads) — só pra não quebrar selects
CREATE TABLE IF NOT EXISTS public.imoveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  titulo text,
  tipologia text,
  status text,
  bairro text,
  cidade text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imoveis TO authenticated;
GRANT ALL ON public.imoveis TO service_role;
ALTER TABLE public.imoveis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access imoveis" ON public.imoveis
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

CREATE TABLE IF NOT EXISTS public.meta_ads_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ads_leads TO authenticated;
GRANT ALL ON public.meta_ads_leads TO service_role;
ALTER TABLE public.meta_ads_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access meta_ads_leads" ON public.meta_ads_leads
  FOR ALL TO authenticated USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

-- integration_configs.connected_by (alguns inserts mandam esse campo)
ALTER TABLE public.integration_configs
  ADD COLUMN IF NOT EXISTS connected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
