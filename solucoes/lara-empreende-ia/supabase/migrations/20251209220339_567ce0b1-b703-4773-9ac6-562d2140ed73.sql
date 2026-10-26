-- Add unique partial index on whatsapp_message_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS messages_whatsapp_message_id_unique 
ON messages (whatsapp_message_id) 
WHERE whatsapp_message_id IS NOT NULL;

-- Clean up stuck messages in message_grouping_queue
UPDATE message_grouping_queue 
SET processed = true 
WHERE processed = false AND process_after < NOW();

-- Clean up completed items older than 1 hour
DELETE FROM message_grouping_queue 
WHERE processed = true AND created_at < NOW() - INTERVAL '1 hour';

-- Clean up failed queue items older than 24 hours
DELETE FROM lara_processing_queue 
WHERE status = 'failed' AND updated_at < NOW() - INTERVAL '24 hours';

DELETE FROM send_queue 
WHERE status = 'failed' AND updated_at < NOW() - INTERVAL '24 hours';