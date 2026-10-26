-- Fix security warnings: Add search_path to functions

-- Fix get_or_create_conversation_state
CREATE OR REPLACE FUNCTION public.get_or_create_conversation_state(p_conversation_id UUID)
RETURNS conversation_states AS $$
DECLARE
    state_record public.conversation_states;
BEGIN
    SELECT * INTO state_record
    FROM public.conversation_states
    WHERE conversation_id = p_conversation_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.conversation_states (conversation_id, current_state)
        VALUES (p_conversation_id, 'idle')
        RETURNING * INTO state_record;
    END IF;
    
    RETURN state_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix update_conversation_state
CREATE OR REPLACE FUNCTION public.update_conversation_state(
    p_conversation_id UUID, 
    p_new_state TEXT, 
    p_action TEXT DEFAULT NULL, 
    p_context JSONB DEFAULT NULL
)
RETURNS conversation_states AS $$
DECLARE
    state_record public.conversation_states;
BEGIN
    INSERT INTO public.conversation_states (
        conversation_id, current_state, last_action, last_action_at, scheduling_context
    )
    VALUES (
        p_conversation_id, p_new_state, p_action, now(), COALESCE(p_context, '{}')
    )
    ON CONFLICT (conversation_id) 
    DO UPDATE SET
        current_state = EXCLUDED.current_state,
        last_action = EXCLUDED.last_action,
        last_action_at = EXCLUDED.last_action_at,
        scheduling_context = CASE 
            WHEN EXCLUDED.scheduling_context = '{}' THEN conversation_states.scheduling_context
            ELSE EXCLUDED.scheduling_context
        END,
        updated_at = now()
    RETURNING * INTO state_record;
    
    RETURN state_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix cleanup_processed_queues
CREATE OR REPLACE FUNCTION public.cleanup_processed_queues()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.message_processing_queue 
    WHERE status = 'completed' AND processed_at < now() - interval '24 hours';
    
    DELETE FROM public.lara_processing_queue 
    WHERE status = 'completed' AND processed_at < now() - interval '24 hours';
    
    DELETE FROM public.send_queue 
    WHERE status = 'completed' AND sent_at < now() - interval '24 hours';
    
    DELETE FROM public.message_processing_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
    
    DELETE FROM public.lara_processing_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
    
    DELETE FROM public.send_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Fix cleanup_processed_message_queue
CREATE OR REPLACE FUNCTION public.cleanup_processed_message_queue()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.message_grouping_queue 
    WHERE processed = true AND created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop and recreate view without SECURITY DEFINER (standard view)
DROP VIEW IF EXISTS public.contacts_with_stats;

CREATE VIEW public.contacts_with_stats AS
SELECT 
    c.*,
    COALESCE(msg_stats.total_messages, 0) AS total_messages,
    COALESCE(msg_stats.lara_messages, 0) AS lara_messages,
    COALESCE(msg_stats.user_messages, 0) AS user_messages,
    COALESCE(msg_stats.human_messages, 0) AS human_messages
FROM public.contacts c
LEFT JOIN (
    SELECT 
        conv.contact_id,
        COUNT(m.id) AS total_messages,
        COUNT(CASE WHEN m.from_type = 'lara' THEN 1 END) AS lara_messages,
        COUNT(CASE WHEN m.from_type = 'user' THEN 1 END) AS user_messages,
        COUNT(CASE WHEN m.from_type = 'human' THEN 1 END) AS human_messages
    FROM public.conversations conv
    JOIN public.messages m ON m.conversation_id = conv.id
    GROUP BY conv.contact_id
) msg_stats ON msg_stats.contact_id = c.id;