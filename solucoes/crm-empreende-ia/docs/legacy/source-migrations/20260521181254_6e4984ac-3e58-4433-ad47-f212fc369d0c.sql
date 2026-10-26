-- Campos imobiliários em activities (Visitas) + novos valores no enum activity_type.
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS imovel_id       uuid REFERENCES imoveis(id),
  ADD COLUMN IF NOT EXISTS visita_status   text,
  ADD COLUMN IF NOT EXISTS visita_feedback text;

ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'visit';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'whatsapp';
