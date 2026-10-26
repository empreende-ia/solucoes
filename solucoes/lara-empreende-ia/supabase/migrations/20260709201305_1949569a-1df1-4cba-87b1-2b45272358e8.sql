
-- 1. Realtime publication
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['messages','conversations','contacts','deals','pipeline_stages','teams','team_functions','team_members','appointments']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    WHEN undefined_table THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- 2. Triggers
-- updated_at trigger function (safe re-create)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contacts','conversations','conversation_states','lara_processing_queue','message_processing_queue','send_queue','lara_settings','tag_definitions']
  LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS update_%1$s_updated_at ON public.%1$s', t);
      EXECUTE format('CREATE TRIGGER update_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- auto_create_deal_on_contact
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_create_deal_on_contact') THEN
    DROP TRIGGER IF EXISTS auto_create_deal_on_contact ON public.contacts;
    CREATE TRIGGER auto_create_deal_on_contact
    AFTER INSERT ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.auto_create_deal_on_contact();
  END IF;
END $$;

-- update_conversation_last_message_trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_conversation_last_message') THEN
    DROP TRIGGER IF EXISTS update_conversation_last_message_trigger ON public.messages;
    CREATE TRIGGER update_conversation_last_message_trigger
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();
  END IF;
END $$;

-- 3. RLS single-tenant policies
DROP POLICY IF EXISTS "Users can manage own deals" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can access all deals" ON public.deals;
CREATE POLICY "Authenticated users can access all deals"
ON public.deals FOR ALL TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can manage own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can access all appointments" ON public.appointments;
CREATE POLICY "Authenticated users can access all appointments"
ON public.appointments FOR ALL TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
