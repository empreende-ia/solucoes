-- Associar dados órfãos ao primeiro admin - versão corrigida
DO $$
DECLARE
  admin_user_id UUID;
  old_stage_id UUID;
  new_stage_id UUID;
BEGIN
  -- Buscar o primeiro usuário admin
  SELECT user_id INTO admin_user_id 
  FROM public.user_roles 
  WHERE role = 'admin' 
  ORDER BY created_at ASC
  LIMIT 1;
  
  IF admin_user_id IS NOT NULL THEN
    -- 1. Atualizar tabelas básicas
    UPDATE public.lara_settings SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE public.contacts SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE public.conversations SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE public.appointments SET user_id = admin_user_id WHERE user_id IS NULL;
    
    -- 2. Para pipeline_stages órfãos com deals referenciando:
    -- Primeiro, migrar os deals para stages equivalentes do admin
    FOR old_stage_id, new_stage_id IN
      SELECT 
        orphan.id as old_id,
        admin_stage.id as new_id
      FROM public.pipeline_stages orphan
      JOIN public.pipeline_stages admin_stage 
        ON orphan.position = admin_stage.position 
        AND admin_stage.user_id = admin_user_id
      WHERE orphan.user_id IS NULL
    LOOP
      UPDATE public.deals SET stage_id = new_stage_id WHERE stage_id = old_stage_id;
    END LOOP;
    
    -- Agora podemos deletar os pipeline_stages órfãos duplicados
    DELETE FROM public.pipeline_stages 
    WHERE user_id IS NULL 
    AND position IN (SELECT position FROM public.pipeline_stages WHERE user_id = admin_user_id);
    
    -- Atualizar os restantes (se houver)
    UPDATE public.pipeline_stages SET user_id = admin_user_id WHERE user_id IS NULL;
    
    -- 3. Atualizar deals órfãos
    UPDATE public.deals SET user_id = admin_user_id WHERE user_id IS NULL;
    
    -- 4. Para tag_definitions: deletar órfãos que conflitam
    DELETE FROM public.tag_definitions 
    WHERE user_id IS NULL 
    AND key IN (SELECT key FROM public.tag_definitions WHERE user_id = admin_user_id);
    UPDATE public.tag_definitions SET user_id = admin_user_id WHERE user_id IS NULL;
    
    -- 5. Para teams: deletar órfãos que conflitam pelo nome
    DELETE FROM public.teams 
    WHERE user_id IS NULL 
    AND name IN (SELECT name FROM public.teams WHERE user_id = admin_user_id);
    UPDATE public.teams SET user_id = admin_user_id WHERE user_id IS NULL;
    
    -- 6. Para team_functions: deletar órfãos que conflitam pelo nome
    DELETE FROM public.team_functions 
    WHERE user_id IS NULL 
    AND name IN (SELECT name FROM public.team_functions WHERE user_id = admin_user_id);
    UPDATE public.team_functions SET user_id = admin_user_id WHERE user_id IS NULL;
    
    -- 7. Atualizar team_members
    UPDATE public.team_members SET user_id = admin_user_id WHERE user_id IS NULL;
    
    RAISE NOTICE 'Dados órfãos associados ao admin: %', admin_user_id;
  ELSE
    RAISE NOTICE 'Nenhum admin encontrado no sistema';
  END IF;
END $$;