-- Migration: Add handoff_enabled flag to ai_agents
-- Permite desabilitar a funcionalidade de transferência para humano

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS handoff_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN ai_agents.handoff_enabled IS 'Se habilitado, o agente pode sugerir transferência para atendente humano';
