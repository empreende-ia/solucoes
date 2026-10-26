-- Migration: Add handoff_instructions to ai_agents
-- Permite configurar regras de quando transferir para humano

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS handoff_instructions TEXT DEFAULT 'Só transfira para humano quando o cliente PEDIR EXPLICITAMENTE para falar com uma pessoa, humano ou atendente.

Se o cliente estiver frustrado ou insatisfeito:
1. Primeiro peça desculpas e tente resolver
2. Ofereça a OPÇÃO de falar com humano
3. Só transfira se ele aceitar';

COMMENT ON COLUMN ai_agents.handoff_instructions IS 'Instruções de quando o agente deve transferir para atendente humano. Concatenado ao system_prompt.';
