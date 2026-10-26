-- Corrigir trigger create_deal_for_new_contact para incluir stage_id
CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  first_stage_id UUID;
BEGIN
  -- Buscar primeiro estágio do pipeline (ordenado por position)
  SELECT id INTO first_stage_id 
  FROM public.pipeline_stages 
  WHERE is_active = true 
  ORDER BY position 
  LIMIT 1;
  
  -- Se não existir estágio, não criar deal (evita erro NOT NULL)
  IF first_stage_id IS NULL THEN
    RAISE NOTICE 'No pipeline stages found, skipping deal creation for contact %', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Criar deal com stage_id válido
  INSERT INTO deals (contact_id, title, company, stage, stage_id, priority)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, NEW.call_name, 'Novo Lead'),
    NULL,
    'new',
    first_stage_id,
    'medium'
  );
  
  RETURN NEW;
END;
$function$;