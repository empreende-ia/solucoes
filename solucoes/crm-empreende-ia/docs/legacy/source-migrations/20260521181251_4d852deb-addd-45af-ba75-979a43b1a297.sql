-- Tabela central do catálogo de imóveis (CRM Imobiliário).
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

-- Todos da org veem o catálogo
CREATE POLICY "imoveis_select" ON imoveis
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Só owner/admin/manager criam
CREATE POLICY "imoveis_insert" ON imoveis
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND org_id = imoveis.org_id
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Só owner/admin/manager editam
CREATE POLICY "imoveis_update" ON imoveis
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND org_id = imoveis.org_id
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Só owner/admin deletam
CREATE POLICY "imoveis_delete" ON imoveis
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND org_id = imoveis.org_id
      AND role IN ('owner', 'admin')
    )
  );
