-- Configurar realtime de forma idempotente para funcionar em remixes
-- Usa DO block com EXCEPTION para ignorar erros se tabela já estiver na publicação

DO $$
BEGIN
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_functions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN 
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;