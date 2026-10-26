-- Campos imobiliários em contacts (Leads).
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS orcamento_min         numeric,
  ADD COLUMN IF NOT EXISTS orcamento_max         numeric,
  ADD COLUMN IF NOT EXISTS bairro_desejado       text,
  ADD COLUMN IF NOT EXISTS quartos_desejado      integer,
  ADD COLUMN IF NOT EXISTS tipologia_interesse   text,
  ADD COLUMN IF NOT EXISTS fonte                 text,
  ADD COLUMN IF NOT EXISTS fonte_campanha_id     text,
  ADD COLUMN IF NOT EXISTS fonte_ad_id           text,
  ADD COLUMN IF NOT EXISTS imovel_interesse_id   uuid REFERENCES imoveis(id),
  ADD COLUMN IF NOT EXISTS tags_perfil           text[],
  ADD COLUMN IF NOT EXISTS reentradas            integer DEFAULT 0;
