-- Create deals table
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT,
  value NUMERIC DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'new',
  priority TEXT DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  due_date DATE,
  owner_id UUID REFERENCES team_members(id),
  notes TEXT,
  lost_reason TEXT,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Função para criar deal automaticamente quando contato é criado
CREATE OR REPLACE FUNCTION create_deal_for_new_contact()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO deals (contact_id, title, company, stage, priority)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, NEW.call_name, 'Novo Lead'),
    NULL,
    'new',
    'medium'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para criar deal quando contato é inserido
CREATE TRIGGER auto_create_deal_on_contact
  AFTER INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION create_deal_for_new_contact();

-- Habilitar RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- Política RLS permissiva
CREATE POLICY "Allow all operations on deals" ON deals
  FOR ALL USING (true) WITH CHECK (true);

-- Criar deals para contatos existentes
INSERT INTO deals (contact_id, title, company, stage, priority)
SELECT 
  id,
  COALESCE(name, call_name, 'Lead ' || phone_number),
  NULL,
  'new',
  'medium'
FROM contacts
WHERE NOT EXISTS (
  SELECT 1 FROM deals WHERE deals.contact_id = contacts.id
);