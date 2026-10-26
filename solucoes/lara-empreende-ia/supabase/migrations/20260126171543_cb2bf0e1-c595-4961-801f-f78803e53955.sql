-- 1. Adicionar tabelas à publicação supabase_realtime (idempotente:
--    num apply greenfield a 20251210150959 já as adicionou)
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
