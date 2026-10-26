-- Drop and recreate the contacts_with_stats view without SECURITY DEFINER
-- This ensures the view respects the RLS policies of the querying user
DROP VIEW IF EXISTS public.contacts_with_stats;

CREATE VIEW public.contacts_with_stats
WITH (security_invoker = true) AS
SELECT 
    c.id,
    c.phone_number,
    c.whatsapp_id,
    c.name,
    c.call_name,
    c.email,
    c.profile_picture_url,
    c.is_business,
    c.is_blocked,
    c.blocked_at,
    c.blocked_reason,
    c.tags,
    c.notes,
    c.client_memory,
    c.first_contact_date,
    c.last_activity,
    c.created_at,
    c.updated_at,
    c.user_id,
    COALESCE(msg_stats.total_messages, 0::bigint) AS total_messages,
    COALESCE(msg_stats.lara_messages, 0::bigint) AS lara_messages,
    COALESCE(msg_stats.user_messages, 0::bigint) AS user_messages,
    COALESCE(msg_stats.human_messages, 0::bigint) AS human_messages
FROM contacts c
LEFT JOIN (
    SELECT 
        conv.contact_id,
        count(m.id) AS total_messages,
        count(CASE WHEN m.from_type = 'lara'::message_from THEN 1 ELSE NULL::integer END) AS lara_messages,
        count(CASE WHEN m.from_type = 'user'::message_from THEN 1 ELSE NULL::integer END) AS user_messages,
        count(CASE WHEN m.from_type = 'human'::message_from THEN 1 ELSE NULL::integer END) AS human_messages
    FROM conversations conv
    JOIN messages m ON m.conversation_id = conv.id
    GROUP BY conv.contact_id
) msg_stats ON msg_stats.contact_id = c.id;

-- Add comment for documentation
COMMENT ON VIEW public.contacts_with_stats IS 'View that aggregates contact information with message statistics. Uses security_invoker=true to respect RLS policies.';