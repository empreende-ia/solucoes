
-- Email templates table
CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  category text,
  variables jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view email templates" ON public.email_templates FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert email templates" ON public.email_templates FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update email templates" ON public.email_templates FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete email templates" ON public.email_templates FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- Emails table
CREATE TABLE public.emails (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  subject text,
  body_html text,
  from_email text,
  to_emails jsonb DEFAULT '[]'::jsonb,
  cc_emails jsonb DEFAULT '[]'::jsonb,
  bcc_emails jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'failed', 'bounced')),
  open_count integer DEFAULT 0,
  click_count integer DEFAULT 0,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  thread_id text,
  message_id text,
  provider text CHECK (provider IN ('gmail', 'outlook', 'manual')),
  is_read boolean DEFAULT false,
  snoozed_until timestamptz,
  is_archived boolean DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view emails" ON public.emails FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert emails" ON public.emails FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update emails" ON public.emails FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete emails" ON public.emails FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

CREATE INDEX idx_emails_org_id ON public.emails(org_id);
CREATE INDEX idx_emails_contact_id ON public.emails(contact_id);
CREATE INDEX idx_emails_deal_id ON public.emails(deal_id);
CREATE INDEX idx_emails_status ON public.emails(status);

-- Email sequences table
CREATE TABLE public.email_sequences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sequences" ON public.email_sequences FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert sequences" ON public.email_sequences FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update sequences" ON public.email_sequences FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete sequences" ON public.email_sequences FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- Sequence steps
CREATE TABLE public.email_sequence_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id uuid NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  step_order integer NOT NULL DEFAULT 0,
  delay_days integer NOT NULL DEFAULT 0,
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject text,
  body_html text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sequence steps" ON public.email_sequence_steps FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert sequence steps" ON public.email_sequence_steps FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update sequence steps" ON public.email_sequence_steps FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete sequence steps" ON public.email_sequence_steps FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- Sequence enrollments (contacts enrolled in sequences)
CREATE TABLE public.email_sequence_enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id uuid NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_step integer DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'replied', 'bounced')),
  enrolled_at timestamptz DEFAULT now(),
  next_send_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.email_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view enrollments" ON public.email_sequence_enrollments FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert enrollments" ON public.email_sequence_enrollments FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update enrollments" ON public.email_sequence_enrollments FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete enrollments" ON public.email_sequence_enrollments FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- Email signatures per user
CREATE TABLE public.email_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL DEFAULT 'Padrão',
  html text NOT NULL DEFAULT '',
  is_default boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signatures" ON public.email_signatures FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own signatures" ON public.email_signatures FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own signatures" ON public.email_signatures FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own signatures" ON public.email_signatures FOR DELETE USING (user_id = auth.uid());

-- Email connections (OAuth tokens per user)
CREATE TABLE public.email_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  provider text NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  email_address text NOT NULL,
  is_active boolean DEFAULT true,
  connected_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections" ON public.email_connections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own connections" ON public.email_connections FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own connections" ON public.email_connections FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own connections" ON public.email_connections FOR DELETE USING (user_id = auth.uid());
