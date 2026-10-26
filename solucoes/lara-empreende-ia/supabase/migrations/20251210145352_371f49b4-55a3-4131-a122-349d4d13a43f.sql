-- =============================================
-- MIGRAÇÃO: Sistema Single-Tenant (V2)
-- Primeiro usuário = Admin + Onboarding
-- Demais usuários = apenas membros da equipe
-- =============================================

-- 1. Apenas atualizar user_id para NULL (sem deletar duplicados)
-- Isso torna os registros globais sem quebrar foreign keys

-- lara_settings: manter apenas 1 (o com mais dados) e tornar global
DO $$
DECLARE
  keep_id UUID;
BEGIN
  -- Selecionar o ID do registro com mais dados preenchidos
  SELECT id INTO keep_id
  FROM public.lara_settings
  ORDER BY 
    CASE WHEN company_name IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN whatsapp_access_token IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN system_prompt_override IS NOT NULL THEN 0 ELSE 1 END,
    updated_at DESC
  LIMIT 1;
  
  -- Deletar todos exceto o selecionado
  IF keep_id IS NOT NULL THEN
    DELETE FROM public.lara_settings WHERE id != keep_id;
  END IF;
END $$;

-- Tornar lara_settings global
UPDATE public.lara_settings SET user_id = NULL;

-- pipeline_stages: NÃO deletar (foreign keys), apenas tornar globais
UPDATE public.pipeline_stages SET user_id = NULL;

-- tag_definitions: deletar duplicados por key, manter o mais recente
DELETE FROM public.tag_definitions a
USING public.tag_definitions b
WHERE a.id > b.id 
  AND a.key = b.key;

-- Tornar globais
UPDATE public.tag_definitions SET user_id = NULL;

-- teams: deletar duplicados por name, manter o mais recente
DELETE FROM public.teams a
USING public.teams b
WHERE a.id > b.id 
  AND a.name = b.name;

-- Tornar globais
UPDATE public.teams SET user_id = NULL;

-- team_functions: deletar duplicados por name, manter o mais recente
DELETE FROM public.team_functions a
USING public.team_functions b
WHERE a.id > b.id 
  AND a.name = b.name;

-- Tornar globais
UPDATE public.team_functions SET user_id = NULL;

-- =============================================
-- 2. Atualizar RLS policies
-- Leitura: todos autenticados
-- Escrita: apenas admins
-- =============================================

-- lara_settings
DROP POLICY IF EXISTS "Users can manage own lara_settings" ON public.lara_settings;
DROP POLICY IF EXISTS "Authenticated can read lara_settings" ON public.lara_settings;
DROP POLICY IF EXISTS "Admins can modify lara_settings" ON public.lara_settings;

CREATE POLICY "Authenticated can read lara_settings" 
ON public.lara_settings 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can modify lara_settings" 
ON public.lara_settings 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- pipeline_stages
DROP POLICY IF EXISTS "Users can manage own pipeline_stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Authenticated can read pipeline_stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Admins can modify pipeline_stages" ON public.pipeline_stages;

CREATE POLICY "Authenticated can read pipeline_stages" 
ON public.pipeline_stages 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can modify pipeline_stages" 
ON public.pipeline_stages 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- tag_definitions
DROP POLICY IF EXISTS "Users can manage own tag_definitions" ON public.tag_definitions;
DROP POLICY IF EXISTS "Authenticated can read tag_definitions" ON public.tag_definitions;
DROP POLICY IF EXISTS "Admins can modify tag_definitions" ON public.tag_definitions;

CREATE POLICY "Authenticated can read tag_definitions" 
ON public.tag_definitions 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can modify tag_definitions" 
ON public.tag_definitions 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- teams
DROP POLICY IF EXISTS "Users can manage own teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated can read teams" ON public.teams;
DROP POLICY IF EXISTS "Admins can modify teams" ON public.teams;

CREATE POLICY "Authenticated can read teams" 
ON public.teams 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can modify teams" 
ON public.teams 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- team_functions
DROP POLICY IF EXISTS "Users can manage own team_functions" ON public.team_functions;
DROP POLICY IF EXISTS "Authenticated can read team_functions" ON public.team_functions;
DROP POLICY IF EXISTS "Admins can modify team_functions" ON public.team_functions;

CREATE POLICY "Authenticated can read team_functions" 
ON public.team_functions 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can modify team_functions" 
ON public.team_functions 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- team_members
DROP POLICY IF EXISTS "Users can manage own team_members" ON public.team_members;
DROP POLICY IF EXISTS "Authenticated can read team_members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can modify team_members" ON public.team_members;

CREATE POLICY "Authenticated can read team_members" 
ON public.team_members 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can modify team_members" 
ON public.team_members 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));