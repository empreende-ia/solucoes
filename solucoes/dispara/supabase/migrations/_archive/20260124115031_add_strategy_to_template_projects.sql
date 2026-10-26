-- Adiciona coluna strategy à tabela template_projects
-- Valores: 'marketing', 'utility', 'bypass'
ALTER TABLE public.template_projects
ADD COLUMN IF NOT EXISTS strategy text DEFAULT 'utility';

-- Comentário para documentação
COMMENT ON COLUMN public.template_projects.strategy IS 'Estratégia de geração: marketing, utility ou bypass (camuflado)';
