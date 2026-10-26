-- Tabela meta_ads_leads: leads brutos vindos do Meta Lead Ads (Facebook/Instagram).
CREATE TABLE IF NOT EXISTS meta_ads_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES contacts(id),
  leadgen_id    text,
  form_id       text,
  ad_id         text,
  campaign_id   text,
  adset_id      text,
  imovel_ref    text,
  payload       jsonb,
  processado    boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE meta_ads_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_ads_leads_org" ON meta_ads_leads
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_roles WHERE user_id = auth.uid()
    )
  );
