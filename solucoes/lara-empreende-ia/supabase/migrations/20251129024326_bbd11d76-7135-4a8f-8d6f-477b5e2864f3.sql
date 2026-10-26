-- Create pipeline_stages table for dynamic Kanban columns
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'border-slate-500',
  position INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow all operations on pipeline_stages"
ON public.pipeline_stages
FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX idx_pipeline_stages_position ON public.pipeline_stages(position);
CREATE INDEX idx_pipeline_stages_is_active ON public.pipeline_stages(is_active);

-- Create trigger for updated_at
CREATE TRIGGER update_pipeline_stages_updated_at
BEFORE UPDATE ON public.pipeline_stages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default stages (migration from constants)
INSERT INTO public.pipeline_stages (title, color, position, is_system) VALUES
  ('Novos Leads', 'border-slate-500', 0, false),
  ('Qualificação', 'border-cyan-500', 1, false),
  ('Apresentação', 'border-violet-500', 2, false),
  ('Negociação', 'border-orange-500', 3, false),
  ('Fechado / Ganho', 'border-emerald-500', 4, true),
  ('Perdido', 'border-red-500', 5, true);

-- Update deals table to reference pipeline_stages instead of hardcoded stage names
-- Add a new column for the stage_id
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.pipeline_stages(id);

-- Migrate existing stage data to stage_id based on title matching
UPDATE public.deals d
SET stage_id = ps.id
FROM public.pipeline_stages ps
WHERE 
  (d.stage = 'new' AND ps.title = 'Novos Leads') OR
  (d.stage = 'qualified' AND ps.title = 'Qualificação') OR
  (d.stage = 'proposal' AND ps.title = 'Apresentação') OR
  (d.stage = 'negotiation' AND ps.title = 'Negociação') OR
  (d.stage = 'won' AND ps.title = 'Fechado / Ganho') OR
  (d.stage = 'lost' AND ps.title = 'Perdido');

-- For any deals without a stage_id, set them to the first stage
UPDATE public.deals
SET stage_id = (SELECT id FROM public.pipeline_stages ORDER BY position LIMIT 1)
WHERE stage_id IS NULL;

-- Now make stage_id required
ALTER TABLE public.deals ALTER COLUMN stage_id SET NOT NULL;

-- Keep the old stage column for backward compatibility during transition
ALTER TABLE public.deals ALTER COLUMN stage DROP NOT NULL;