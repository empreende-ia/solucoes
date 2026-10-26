-- imoveis table
CREATE TABLE IF NOT EXISTS imoveis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id        uuid REFERENCES profiles(id),
  titulo          text NOT NULL,
  descricao       text,
  tipo            text,
  tipologia       text,
  status          text DEFAULT 'disponivel',
  valor           numeric,
  area_m2         numeric,
  quartos         integer,
  banheiros       integer,
  vagas           integer,
  bairro          text,
  cidade          text,
  estado          text,
  cep             text,
  endereco        text,
  fotos           text[],
  tags            text[],
  construtora_id  uuid REFERENCES companies(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE imoveis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imoveis_select" ON imoveis FOR SELECT USING (
  org_id IN (SELECT org_id FROM user_roles WHERE user_id = auth.uid())
);
CREATE POLICY "imoveis_insert" ON imoveis FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND org_id = imoveis.org_id AND role IN ('owner','admin','manager'))
);
CREATE POLICY "imoveis_update" ON imoveis FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND org_id = imoveis.org_id AND role IN ('owner','admin','manager'))
);
CREATE POLICY "imoveis_delete" ON imoveis FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND org_id = imoveis.org_id AND role IN ('owner','admin'))
);

-- contacts real-estate fields
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS orcamento_min       numeric,
  ADD COLUMN IF NOT EXISTS orcamento_max       numeric,
  ADD COLUMN IF NOT EXISTS bairro_desejado     text,
  ADD COLUMN IF NOT EXISTS quartos_desejado    integer,
  ADD COLUMN IF NOT EXISTS tipologia_interesse text,
  ADD COLUMN IF NOT EXISTS fonte               text,
  ADD COLUMN IF NOT EXISTS fonte_campanha_id   text,
  ADD COLUMN IF NOT EXISTS fonte_ad_id         text,
  ADD COLUMN IF NOT EXISTS imovel_interesse_id uuid REFERENCES imoveis(id),
  ADD COLUMN IF NOT EXISTS tags_perfil         text[],
  ADD COLUMN IF NOT EXISTS reentradas          integer DEFAULT 0;

-- deals real-estate fields
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS imovel_id            uuid REFERENCES imoveis(id),
  ADD COLUMN IF NOT EXISTS loss_reason_category text,
  ADD COLUMN IF NOT EXISTS loss_reason_detail   text;

-- activities real-estate fields + enum values
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS imovel_id       uuid REFERENCES imoveis(id),
  ADD COLUMN IF NOT EXISTS visita_status   text,
  ADD COLUMN IF NOT EXISTS visita_feedback text;
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'visit';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'whatsapp';

-- meta_ads_leads table
CREATE TABLE IF NOT EXISTS meta_ads_leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES contacts(id),
  leadgen_id  text,
  form_id     text,
  ad_id       text,
  campaign_id text,
  adset_id    text,
  imovel_ref  text,
  payload     jsonb,
  processado  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE meta_ads_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_ads_leads_org" ON meta_ads_leads FOR ALL USING (
  org_id IN (SELECT org_id FROM user_roles WHERE user_id = auth.uid())
);

-- hierarchical visibility on contacts/deals
DROP POLICY IF EXISTS "Org members can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Org members can view deals"    ON public.deals;

CREATE POLICY "contacts_select_by_role" ON contacts FOR SELECT USING (
  CASE
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND org_id = contacts.org_id AND role IN ('owner','admin')) THEN true
    WHEN EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN team_members tm_self   ON tm_self.user_id   = auth.uid()
      JOIN team_members tm_target ON tm_target.team_id = tm_self.team_id
      WHERE ur.user_id = auth.uid() AND ur.org_id = contacts.org_id AND ur.role = 'manager'
        AND contacts.owner_id = tm_target.user_id
    ) THEN true
    WHEN contacts.owner_id = auth.uid() THEN true
    ELSE false
  END
);

CREATE POLICY "deals_select_by_role" ON deals FOR SELECT USING (
  CASE
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND org_id = deals.org_id AND role IN ('owner','admin')) THEN true
    WHEN EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN team_members tm_self   ON tm_self.user_id   = auth.uid()
      JOIN team_members tm_target ON tm_target.team_id = tm_self.team_id
      WHERE ur.user_id = auth.uid() AND ur.org_id = deals.org_id AND ur.role = 'manager'
        AND deals.owner_id = tm_target.user_id
    ) THEN true
    WHEN deals.owner_id = auth.uid() THEN true
    ELSE false
  END
);