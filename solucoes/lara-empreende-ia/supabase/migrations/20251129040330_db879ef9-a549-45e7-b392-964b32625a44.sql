-- Add AI trigger criteria to pipeline stages
ALTER TABLE pipeline_stages 
ADD COLUMN ai_trigger_criteria TEXT DEFAULT NULL;

COMMENT ON COLUMN pipeline_stages.ai_trigger_criteria IS 
  'Descrição textual de quando a IA deve mover um deal para este estágio. Ex: "Lead demonstrou interesse claro e pediu demonstração"';
