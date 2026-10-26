-- Add message_id column to send_queue table to reference pre-created messages
ALTER TABLE send_queue ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages(id);