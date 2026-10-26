
-- Add lead_score to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0;

-- Add BANT qualification fields to deals (JSONB)
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS qualification jsonb DEFAULT '{"budget": null, "authority": null, "need": null, "timeline": null, "budget_notes": "", "authority_notes": "", "need_notes": "", "timeline_notes": ""}'::jsonb;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS qualification_score integer DEFAULT 0;

-- Lead scoring rules (configurable by org)
CREATE TABLE public.lead_scoring_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  event_type text NOT NULL,
  label text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lead_scoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view scoring rules" ON public.lead_scoring_rules FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert scoring rules" ON public.lead_scoring_rules FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update scoring rules" ON public.lead_scoring_rules FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete scoring rules" ON public.lead_scoring_rules FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- Score history log
CREATE TABLE public.lead_score_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text NOT NULL,
  event_type text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lead_score_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view score history" ON public.lead_score_history FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert score history" ON public.lead_score_history FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));

CREATE INDEX idx_score_history_contact ON public.lead_score_history(contact_id);

-- Segments (dynamic lists)
CREATE TABLE public.segments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  description text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view segments" ON public.segments FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert segments" ON public.segments FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update segments" ON public.segments FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete segments" ON public.segments FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
