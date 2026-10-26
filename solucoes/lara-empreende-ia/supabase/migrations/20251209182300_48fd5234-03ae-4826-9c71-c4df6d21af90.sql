-- Corrigir função para criar deals com user_id do contato
CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  first_stage_id UUID;
BEGIN
  -- Buscar primeiro estágio do pipeline DO MESMO USER_ID DO CONTATO
  SELECT id INTO first_stage_id 
  FROM public.pipeline_stages 
  WHERE is_active = true 
    AND (user_id = NEW.user_id OR user_id IS NULL)
  ORDER BY position 
  LIMIT 1;
  
  IF first_stage_id IS NULL THEN
    RAISE NOTICE 'No pipeline stages found, skipping deal creation for contact %', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Criar deal COM O MESMO USER_ID DO CONTATO
  INSERT INTO deals (contact_id, title, company, stage, stage_id, priority, user_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, NEW.call_name, 'Novo Lead'),
    NULL,
    'new',
    first_stage_id,
    'medium',
    NEW.user_id
  );
  
  RETURN NEW;
END;
$function$;

-- Recriar o trigger (drop first para garantir)
DROP TRIGGER IF EXISTS auto_create_deal_on_contact ON contacts;
CREATE TRIGGER auto_create_deal_on_contact
  AFTER INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION create_deal_for_new_contact();

-- Atualizar o voice ID padrão no banco
ALTER TABLE lara_settings ALTER COLUMN elevenlabs_voice_id SET DEFAULT '33B4UnXyTNbgLmdEDh5P';