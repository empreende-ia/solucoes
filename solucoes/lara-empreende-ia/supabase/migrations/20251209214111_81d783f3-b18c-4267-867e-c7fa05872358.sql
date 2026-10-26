-- Add message_id column to message_grouping_queue to reference the already-created message
ALTER TABLE public.message_grouping_queue ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.messages(id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_message_grouping_queue_message_id ON public.message_grouping_queue(message_id);