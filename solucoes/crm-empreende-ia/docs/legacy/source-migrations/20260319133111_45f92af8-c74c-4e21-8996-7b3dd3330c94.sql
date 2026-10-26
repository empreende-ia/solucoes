
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

ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sales goals" ON public.sales_goals
  FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can insert sales goals" ON public.sales_goals
  FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can update sales goals" ON public.sales_goals
  FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can delete sales goals" ON public.sales_goals
  FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

CREATE INDEX idx_sales_goals_org ON public.sales_goals(org_id);
CREATE INDEX idx_sales_goals_period ON public.sales_goals(org_id, period_year, period_month);
