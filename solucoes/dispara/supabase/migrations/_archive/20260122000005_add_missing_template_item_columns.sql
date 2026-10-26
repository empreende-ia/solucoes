-- =============================================================================
-- Migration: Adicionar TODAS as colunas faltantes em template_project_items
-- =============================================================================
-- Sincroniza o schema do banco com a interface TypeScript TemplateProjectItem
-- =============================================================================

-- Colunas de estrutura do template (separadas do components)
ALTER TABLE public.template_project_items
ADD COLUMN IF NOT EXISTS header jsonb;

ALTER TABLE public.template_project_items
ADD COLUMN IF NOT EXISTS footer jsonb;

ALTER TABLE public.template_project_items
ADD COLUMN IF NOT EXISTS buttons jsonb;

-- Variáveis genéricas (usado em MARKETING/UTILITY)
ALTER TABLE public.template_project_items
ADD COLUMN IF NOT EXISTS variables jsonb;

-- Comentários
COMMENT ON COLUMN public.template_project_items.header IS 'Configuração do header do template (formato: {format: TEXT|IMAGE|VIDEO|DOCUMENT, text?: string})';
COMMENT ON COLUMN public.template_project_items.footer IS 'Configuração do footer do template (formato: {text: string})';
COMMENT ON COLUMN public.template_project_items.buttons IS 'Array de botões do template (formato: [{type: URL|PHONE|QUICK_REPLY, text: string, ...}])';
COMMENT ON COLUMN public.template_project_items.variables IS 'Valores das variáveis para preview (Record<string, string>)';
