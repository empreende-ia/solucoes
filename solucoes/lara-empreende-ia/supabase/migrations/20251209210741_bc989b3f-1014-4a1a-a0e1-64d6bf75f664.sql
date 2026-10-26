-- Add process_after column for timer-based message grouping
ALTER TABLE public.message_grouping_queue 
ADD COLUMN IF NOT EXISTS process_after TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '20 seconds');

-- Add index for efficient querying of ready-to-process messages
CREATE INDEX IF NOT EXISTS idx_message_grouping_ready 
ON public.message_grouping_queue (process_after, processed) 
WHERE processed = false;