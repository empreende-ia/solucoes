-- =============================================================================
-- Migration: Adicionar coluna source na tabela template_projects
-- =============================================================================
-- Distingue a origem dos projetos de template:
-- - 'ai': gerado pela IA (default)
-- - 'manual': criado manualmente no builder
-- =============================================================================

-- Adicionar coluna source com default 'ai'
ALTER TABLE public.template_projects
ADD COLUMN IF NOT EXISTS source text DEFAULT 'ai';

-- Comentário para documentação
COMMENT ON COLUMN public.template_projects.source IS 'Origem do projeto: ai (gerado pela IA) ou manual (criado no builder)';
