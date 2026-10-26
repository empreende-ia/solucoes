-- ============================================================
-- CRM Saúde — Schema de adaptação sobre o projeto base
-- ============================================================

-- 1. ADAPTAR activities para suportar consultas
-- Renomear visita_status → appointment_status
-- Remover imovel_id (contexto imobiliário)
-- Adicionar campos de saúde

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS appointment_status TEXT,
  ADD COLUMN IF NOT EXISTS appointment_type   TEXT DEFAULT 'consulta',
  ADD COLUMN IF NOT EXISTS duration_minutes   INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS professional_id    UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_at   TIMESTAMPTZ;

-- Migrar dados de visita_status para appointment_status (se existirem)
UPDATE public.activities
  SET appointment_status = visita_status
  WHERE visita_status IS NOT NULL AND appointment_status IS NULL;

-- Remover colunas do contexto imobiliário (se existirem)
ALTER TABLE public.activities
  DROP COLUMN IF EXISTS imovel_id,
  DROP COLUMN IF EXISTS visita_status,
  DROP COLUMN IF EXISTS visita_feedback;

-- 2. CRIAR tabela patients (substitui contacts)
CREATE TABLE IF NOT EXISTS public.patients (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name              TEXT NOT NULL,
  last_name               TEXT,
  email                   TEXT,
  phone                   TEXT NOT NULL,
  cpf                     TEXT,
  date_of_birth           DATE,
  blood_type              TEXT,
  allergies               TEXT,
  health_plan             TEXT,
  health_plan_number      TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  address                 TEXT,
  notes                   TEXT,
  avatar_url              TEXT,
  owner_id                UUID REFERENCES auth.users(id),
  status                  TEXT NOT NULL DEFAULT 'active',
  no_show_count           INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- 3. CRIAR tabela medical_records (prontuário digital)
CREATE TABLE IF NOT EXISTS public.medical_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id           UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  patient_id            UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id       UUID REFERENCES auth.users(id),
  chief_complaint       TEXT,
  clinical_summary      TEXT,
  ai_generated_summary  TEXT,
  diagnosis             TEXT,
  prescriptions         JSONB DEFAULT '[]',
  follow_up_date        DATE,
  attachments           JSONB DEFAULT '[]',
  is_draft              BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- 4. CRIAR tabela payments (financeiro)
CREATE TABLE IF NOT EXISTS public.payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id      UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  patient_id       UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  procedure_name   TEXT NOT NULL,
  amount           NUMERIC NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'pix',
  status           TEXT NOT NULL DEFAULT 'pending',
  paid_at          TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- 5. CRIAR tabela health_goals (metas de atendimento)
CREATE TABLE IF NOT EXISTS public.health_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  goal_type     TEXT NOT NULL DEFAULT 'appointments',
  target_value  NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  period_month  INTEGER NOT NULL,
  period_year   INTEGER NOT NULL,
  user_id       UUID,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 6. RLS — patients
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view patients"   ON public.patients FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert patients" ON public.patients FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update patients" ON public.patients FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete patients" ON public.patients FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- 7. RLS — medical_records (dados sensíveis LGPD)
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view records"   ON public.medical_records FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert records" ON public.medical_records FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update records" ON public.medical_records FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id) AND (SELECT is_draft FROM public.medical_records mr WHERE mr.id = medical_records.id));
CREATE POLICY "Org members can delete records" ON public.medical_records FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- 8. RLS — payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view payments"   ON public.payments FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert payments" ON public.payments FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update payments" ON public.payments FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete payments" ON public.payments FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- 9. RLS — health_goals
ALTER TABLE public.health_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage health goals" ON public.health_goals FOR ALL USING (user_belongs_to_org(auth.uid(), org_id));

-- 10. INDEXES
CREATE INDEX IF NOT EXISTS idx_patients_org        ON public.patients(org_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone      ON public.patients(org_id, phone);
CREATE INDEX IF NOT EXISTS idx_patients_cpf        ON public.patients(org_id, cpf);
CREATE INDEX IF NOT EXISTS idx_medical_records_patient ON public.medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_org ON public.medical_records(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_org        ON public.payments(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient    ON public.payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_activities_appointment_status ON public.activities(org_id, appointment_status) WHERE appointment_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_appt_date ON public.activities(org_id, due_date) WHERE appointment_status IS NOT NULL;

-- 11. TRIGGERS de updated_at
CREATE TRIGGER update_patients_updated_at       BEFORE UPDATE ON public.patients       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_medical_records_updated_at BEFORE UPDATE ON public.medical_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at       BEFORE UPDATE ON public.payments       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;

-- 13. STORAGE — prontuários e fotos de pacientes
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-attachments', 'medical-attachments', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-photos', 'patient-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated org members can upload medical attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'medical-attachments');

CREATE POLICY "Authenticated org members can read medical attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'medical-attachments');

CREATE POLICY "Authenticated org members can upload patient photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'patient-photos');

CREATE POLICY "Authenticated org members can read patient photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'patient-photos');

-- 14. WHATSAPP AI CONFIG — defaults adaptados para contexto de clínica
ALTER TABLE public.whatsapp_ai_config
  ALTER COLUMN system_prompt SET DEFAULT 'Você é a assistente virtual da clínica. Seu objetivo é confirmar consultas, responder dúvidas básicas sobre horários e orientar o paciente. Seja gentil, profissional e objetivo. Nunca forneça diagnósticos ou orientações médicas. Para perguntas clínicas, oriente o paciente a consultar o profissional de saúde.';

ALTER TABLE public.whatsapp_ai_config
  ALTER COLUMN fallback_msg SET DEFAULT 'Aguarde, um de nossos atendentes irá lhe ajudar em breve. 🩺';

