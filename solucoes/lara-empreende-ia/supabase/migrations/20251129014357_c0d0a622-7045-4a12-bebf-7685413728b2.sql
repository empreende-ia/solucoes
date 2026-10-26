-- Add company information columns to lara_settings
ALTER TABLE lara_settings 
ADD COLUMN company_name text DEFAULT NULL,
ADD COLUMN sdr_name text DEFAULT NULL;