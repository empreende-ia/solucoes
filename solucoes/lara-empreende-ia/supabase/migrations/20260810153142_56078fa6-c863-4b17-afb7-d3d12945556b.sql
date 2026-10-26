ALTER VIEW public.lara_settings_public SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.assign_appointment_workspace() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_workspace_membership_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_knowledge_fact() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.can_edit_agent(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_publish_agent(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_agent_context() FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_agent_product_event(uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_agent_version_to_draft(uuid, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_agent_suggestion(uuid, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_agent_draft(uuid, jsonb, integer) FROM anon;

DROP POLICY IF EXISTS "Authenticated can read unanswered questions" ON public.unanswered_questions;