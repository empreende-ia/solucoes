-- Add ai_scheduling_enabled setting and metadata column for AI-created appointments

-- 1. Add ai_scheduling_enabled to lara_settings
ALTER TABLE public.lara_settings 
ADD COLUMN IF NOT EXISTS ai_scheduling_enabled BOOLEAN DEFAULT true;

-- 2. Add metadata column to appointments for tracking AI-created appointments
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 3. Add index for filtering AI-created appointments
CREATE INDEX IF NOT EXISTS idx_appointments_metadata_source 
ON public.appointments USING GIN (metadata jsonb_path_ops);