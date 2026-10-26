
-- 1. ORGANIZATIONS
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT DEFAULT 'free',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. PROFILES — add missing columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 1;

UPDATE public.profiles SET name = COALESCE(name, full_name) WHERE name IS NULL;

-- 3. Helper: current_org_id
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;

-- 4. Org policies
CREATE POLICY "Members read own org" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id());
CREATE POLICY "Admins update own org" ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.current_org_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')));
CREATE POLICY "Authenticated insert orgs" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (true);

-- 5. PIPELINES
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipelines TO authenticated;
GRANT ALL ON public.pipelines TO service_role;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access pipelines" ON public.pipelines FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated;
GRANT ALL ON public.pipeline_stages TO service_role;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access stages" ON public.pipeline_stages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_id AND p.org_id = public.current_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_id AND p.org_id = public.current_org_id()));

-- 6. INTEGRATION CONFIGS
CREATE TABLE public.integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_configs TO authenticated;
GRANT ALL ON public.integration_configs TO service_role;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins manage integrations" ON public.integration_configs FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')))
  WITH CHECK (org_id = public.current_org_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')));
CREATE POLICY "Org members read integrations" ON public.integration_configs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- 7. PATIENTS
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT NOT NULL,
  cpf TEXT,
  date_of_birth DATE,
  blood_type TEXT,
  allergies TEXT,
  health_plan TEXT,
  health_plan_number TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  address TEXT,
  notes TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  no_show_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patients_org ON public.patients(org_id);
CREATE INDEX idx_patients_owner ON public.patients(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access patients" ON public.patients FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- 8. ACTIVITIES
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'task',
  title TEXT NOT NULL,
  body TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  appointment_status TEXT,
  appointment_type TEXT,
  duration_minutes INTEGER,
  whatsapp_reminder_sent BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_org ON public.activities(org_id);
CREATE INDEX idx_activities_contact ON public.activities(contact_id);
CREATE INDEX idx_activities_due ON public.activities(due_date);
CREATE INDEX idx_activities_appt_status ON public.activities(appointment_status) WHERE appointment_status IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access activities" ON public.activities FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- 9. MEDICAL RECORDS
CREATE TABLE public.medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  chief_complaint TEXT,
  clinical_summary TEXT,
  diagnosis TEXT,
  prescriptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  follow_up_date DATE,
  is_draft BOOLEAN NOT NULL DEFAULT true,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_medical_records_org ON public.medical_records(org_id);
CREATE INDEX idx_medical_records_patient ON public.medical_records(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_records TO authenticated;
GRANT ALL ON public.medical_records TO service_role;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read records" ON public.medical_records FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "Org members insert records" ON public.medical_records FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "Org members update drafts" ON public.medical_records FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND is_draft = true)
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "Org admins delete drafts" ON public.medical_records FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND is_draft = true);

-- 10. PAYMENTS
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  procedure_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'pix',
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_org ON public.payments(org_id);
CREATE INDEX idx_payments_patient ON public.payments(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access payments" ON public.payments FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- 11. updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_orgs_touch BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pipelines_touch BEFORE UPDATE ON public.pipelines FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_integration_configs_touch BEFORE UPDATE ON public.integration_configs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_patients_touch BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_activities_touch BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_medical_records_touch BEFORE UPDATE ON public.medical_records FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_payments_touch BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 12. Seed: Sabrina's organization + default pipeline
DO $seed$
DECLARE
  _sabrina_id UUID := 'd430e022-6efa-485f-83c8-5a5d02a6bf81';
  _org_id UUID;
  _pipe_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _sabrina_id) THEN
    INSERT INTO public.organizations (name, slug, plan, settings)
    VALUES ('Clínica Sabrina Oliveira', 'clinica-sabrina-oliveira', 'pro',
            jsonb_build_object('default_currency','BRL','segment','clinica'))
    RETURNING id INTO _org_id;

    UPDATE public.profiles
      SET org_id = _org_id,
          name = COALESCE(name, full_name, 'Sabrina Oliveira'),
          onboarding_completed = true,
          onboarding_step = 7
      WHERE id = _sabrina_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (_sabrina_id, 'owner'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.pipelines (org_id, name, currency, is_default)
    VALUES (_org_id, 'Pipeline Padrão', 'BRL', true)
    RETURNING id INTO _pipe_id;

    INSERT INTO public.pipeline_stages (pipeline_id, name, position, probability) VALUES
      (_pipe_id, 'Novo', 0, 10),
      (_pipe_id, 'Em atendimento', 1, 40),
      (_pipe_id, 'Aguardando retorno', 2, 70),
      (_pipe_id, 'Concluído', 3, 100);
  END IF;
END $seed$;
