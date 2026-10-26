-- =============================================================================
-- MIGRATION: Atualizar modelo padrão para gemini-3-flash-preview
-- Data: 2026-01-23
-- Motivo: O modelo padrão gemini-2.5-flash está desatualizado
-- =============================================================================

-- Alterar o default da coluna model para gemini-3-flash-preview
ALTER TABLE public.ai_agents
ALTER COLUMN model SET DEFAULT 'gemini-3-flash-preview';

-- Também atualizar agentes existentes que ainda usam o modelo antigo
-- (opcional - só atualiza se o usuário não tiver escolhido intencionalmente)
UPDATE public.ai_agents
SET model = 'gemini-3-flash-preview'
WHERE model = 'gemini-2.5-flash';
