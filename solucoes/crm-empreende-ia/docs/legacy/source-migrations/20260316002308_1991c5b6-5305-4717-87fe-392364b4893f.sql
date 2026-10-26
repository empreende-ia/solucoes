
-- Custom field definitions
CREATE TABLE public.custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contacts', 'companies', 'deals')),
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'textarea', 'number', 'currency', 'date', 'select', 'multi_select', 'checkbox', 'url', 'email', 'phone')),
  options jsonb DEFAULT '[]',
  is_required boolean DEFAULT false,
  show_in_table boolean DEFAULT true,
  show_in_card boolean DEFAULT true,
  field_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, entity_type, field_key)
);
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage custom fields" ON public.custom_field_definitions FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));

-- Teams
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage teams" ON public.teams FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));

-- Team members junction
CREATE TABLE public.team_members (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage team members" ON public.team_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND user_belongs_to_org(auth.uid(), t.org_id))
);

-- Notification preferences
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  daily_summary boolean DEFAULT true,
  daily_summary_hour integer DEFAULT 9,
  notify_deal_won boolean DEFAULT true,
  notify_deal_lost boolean DEFAULT true,
  notify_task_overdue boolean DEFAULT true,
  notify_mention boolean DEFAULT true,
  notify_assignment boolean DEFAULT true,
  email_daily_summary boolean DEFAULT true,
  email_deal_won boolean DEFAULT false,
  email_task_overdue boolean DEFAULT false,
  UNIQUE(user_id, org_id)
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own notification prefs" ON public.notification_preferences FOR ALL USING (user_id = auth.uid());

-- Loss reasons
CREATE TABLE public.loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_active boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage loss reasons" ON public.loss_reasons FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));

CREATE INDEX idx_custom_fields_org ON public.custom_field_definitions(org_id, entity_type);
CREATE INDEX idx_teams_org ON public.teams(org_id);
CREATE INDEX idx_loss_reasons_org ON public.loss_reasons(org_id);
