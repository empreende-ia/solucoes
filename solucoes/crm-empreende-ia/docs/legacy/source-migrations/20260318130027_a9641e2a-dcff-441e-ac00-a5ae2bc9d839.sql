
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

ALTER TABLE public.risk_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view risk rules" ON public.risk_rules
  FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can insert risk rules" ON public.risk_rules
  FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can update risk rules" ON public.risk_rules
  FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can delete risk rules" ON public.risk_rules
  FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

CREATE INDEX idx_risk_rules_org_id ON public.risk_rules(org_id);
