-- Create deal_activities table for CRM activity tracking
CREATE TABLE IF NOT EXISTS public.deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  is_completed BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.team_members(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT deal_activities_type_check CHECK (type IN ('note', 'call', 'email', 'meeting', 'task'))
);

-- Enable RLS
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow all operations on deal_activities"
ON public.deal_activities
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for better query performance
CREATE INDEX idx_deal_activities_deal_id ON public.deal_activities(deal_id);
CREATE INDEX idx_deal_activities_created_at ON public.deal_activities(created_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_deal_activities_updated_at
BEFORE UPDATE ON public.deal_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();