-- Add audio_response_enabled column to lara_settings
ALTER TABLE lara_settings 
ADD COLUMN IF NOT EXISTS audio_response_enabled BOOLEAN DEFAULT false;

-- Create storage bucket for audio messages
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-messages', 'audio-messages', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy for public read access
CREATE POLICY "Public read access for audio" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'audio-messages');

-- RLS policy for service role insert
CREATE POLICY "Service role insert for audio" ON storage.objects
FOR INSERT TO service_role WITH CHECK (bucket_id = 'audio-messages');