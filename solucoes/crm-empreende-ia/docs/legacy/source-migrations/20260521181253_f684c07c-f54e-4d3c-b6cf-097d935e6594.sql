-- Campos imobiliários em deals (Pipeline).
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS imovel_id             uuid REFERENCES imoveis(id),
  ADD COLUMN IF NOT EXISTS loss_reason_category  text,
  ADD COLUMN IF NOT EXISTS loss_reason_detail    text;
