-- =============================================================================
-- Migration: Adicionar colunas de variáveis para templates BYPASS
-- =============================================================================
-- Adiciona sample_variables e marketing_variables na tabela template_project_items
-- para suportar a estratégia BYPASS de geração de templates.
--
-- sample_variables: valores comportados para enviar à Meta na criação
-- marketing_variables: valores agressivos de marketing para envio real
-- =============================================================================

-- Adicionar coluna sample_variables (JSONB para armazenar Record<string, string>)
ALTER TABLE public.template_project_items
ADD COLUMN IF NOT EXISTS sample_variables jsonb;

-- Adicionar coluna marketing_variables (JSONB para armazenar Record<string, string>)
ALTER TABLE public.template_project_items
ADD COLUMN IF NOT EXISTS marketing_variables jsonb;

-- Comentários para documentação
COMMENT ON COLUMN public.template_project_items.sample_variables IS 'Valores comportados das variáveis para enviar à Meta na criação do template (estilo oficial Meta)';
COMMENT ON COLUMN public.template_project_items.marketing_variables IS 'Valores agressivos de marketing das variáveis para usar no envio real após aprovação';
