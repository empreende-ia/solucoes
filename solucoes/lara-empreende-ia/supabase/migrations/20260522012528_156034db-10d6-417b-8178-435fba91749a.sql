
-- 1. lara_settings: restrict SELECT to admins, create public-safe view
DROP POLICY IF EXISTS "Authenticated can read lara_settings" ON public.lara_settings;

CREATE POLICY "Admins can read lara_settings"
ON public.lara_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.lara_settings_public
WITH (security_invoker = true) AS
SELECT id, company_name, sdr_name, is_active, auto_response_enabled,
       timezone, business_hours_start, business_hours_end, business_days
FROM public.lara_settings;

GRANT SELECT ON public.lara_settings_public TO authenticated, anon;

-- 2. Queue tables: replace permissive public policies with authenticated-only
DROP POLICY IF EXISTS "Allow all operations on message_grouping_queue" ON public.message_grouping_queue;
CREATE POLICY "Authenticated access message_grouping_queue"
ON public.message_grouping_queue FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on message_processing_queue" ON public.message_processing_queue;
CREATE POLICY "Authenticated access message_processing_queue"
ON public.message_processing_queue FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on lara_processing_queue" ON public.lara_processing_queue;
CREATE POLICY "Authenticated access lara_processing_queue"
ON public.lara_processing_queue FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on send_queue" ON public.send_queue;
CREATE POLICY "Authenticated access send_queue"
ON public.send_queue FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- 3. Remove public SELECT (listing) policy from audio-messages bucket
--    Public bucket file URLs still work via CDN; this only blocks API listing.
DROP POLICY IF EXISTS "Public read access for audio" ON storage.objects;

-- 4. Revoke EXECUTE on SECURITY DEFINER helpers from anon
REVOKE EXECUTE ON FUNCTION public.claim_message_processing_batch(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_lara_processing_batch(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_send_queue_batch(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_or_create_conversation_state(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_client_memory(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_conversation_state(uuid, text, text, jsonb) FROM anon, public;
