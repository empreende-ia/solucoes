-- Realtime para tabelas-chave (idempotente: já adicionadas em migrations anteriores)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages', 'conversations', 'contacts', 'deals', 'pipeline_stages',
    'teams', 'team_functions', 'team_members', 'appointments'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- tabela já estava na publicação
    END;
  END LOOP;
END;
$$;
