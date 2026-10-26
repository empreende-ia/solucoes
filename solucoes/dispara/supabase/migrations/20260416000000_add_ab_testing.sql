-- A/B Testing support for campaigns
-- Adds variant tracking to campaign_contacts and A/B config to campaigns

-- Variant column on campaign_contacts (A or B)
ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'A';
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_variant ON campaign_contacts(campaign_id, variant, status);

-- A/B config columns on campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_test_enabled BOOLEAN DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_template_name_b TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_template_variables_b JSONB;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_template_snapshot_b JSONB;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_split_ratio INTEGER DEFAULT 50;
