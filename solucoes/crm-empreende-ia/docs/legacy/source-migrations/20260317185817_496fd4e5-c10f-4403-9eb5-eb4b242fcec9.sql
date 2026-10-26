
-- Create whatsapp_instances table for multi-instance support
CREATE TABLE public.whatsapp_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  server_url text NOT NULL,
  api_key text NOT NULL,
  phone_number text,
  status text NOT NULL DEFAULT 'disconnected',
  qrcode_base64 text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(org_id, instance_name)
);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view instances"
  ON public.whatsapp_instances FOR SELECT
  USING (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can insert instances"
  ON public.whatsapp_instances FOR INSERT
  WITH CHECK (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can update instances"
  ON public.whatsapp_instances FOR UPDATE
  USING (user_belongs_to_org(auth.uid(), org_id));

CREATE POLICY "Org members can delete instances"
  ON public.whatsapp_instances FOR DELETE
  USING (user_belongs_to_org(auth.uid(), org_id));

-- Add instance_id to conversations
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- Add instance_name to conversations as denormalized field for display
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN instance_name text;

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
