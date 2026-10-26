-- Add is_ai_managed column to pipeline_stages
ALTER TABLE pipeline_stages 
ADD COLUMN is_ai_managed BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN pipeline_stages.is_ai_managed IS 
  'Se true, a IA pode mover deals automaticamente para este estágio. Se false, apenas movimentação manual.';