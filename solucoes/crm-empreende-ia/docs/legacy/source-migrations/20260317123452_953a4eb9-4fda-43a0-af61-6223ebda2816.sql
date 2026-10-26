
-- WhatsApp Conversations
CREATE TABLE public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  profile_pic_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  mode TEXT NOT NULL DEFAULT 'ai',
  assigned_to UUID,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_conversations_org ON public.whatsapp_conversations(org_id);
CREATE INDEX idx_whatsapp_conversations_phone ON public.whatsapp_conversations(org_id, phone_number);
CREATE INDEX idx_whatsapp_conversations_last_msg ON public.whatsapp_conversations(org_id, last_message_at DESC);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view whatsapp conversations" ON public.whatsapp_conversations FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert whatsapp conversations" ON public.whatsapp_conversations FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update whatsapp conversations" ON public.whatsapp_conversations FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete whatsapp conversations" ON public.whatsapp_conversations FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- WhatsApp Messages
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  evolution_id TEXT UNIQUE,
  direction TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  media_mime TEXT,
  caption TEXT,
  is_ai BOOLEAN NOT NULL DEFAULT false,
  ai_model TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  quoted_msg_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_conv ON public.whatsapp_messages(conversation_id, sent_at DESC);
CREATE INDEX idx_whatsapp_messages_org ON public.whatsapp_messages(org_id);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view whatsapp messages" ON public.whatsapp_messages FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert whatsapp messages" ON public.whatsapp_messages FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update whatsapp messages" ON public.whatsapp_messages FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete whatsapp messages" ON public.whatsapp_messages FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;

-- WhatsApp AI Config
CREATE TABLE public.whatsapp_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  system_prompt TEXT NOT NULL DEFAULT '',
  fallback_msg TEXT NOT NULL DEFAULT 'Aguarde, um de nossos atendentes irá lhe ajudar em breve.',
  auto_create_lead BOOLEAN NOT NULL DEFAULT true,
  lead_pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  lead_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  response_delay_ms INTEGER NOT NULL DEFAULT 1500,
  max_ai_turns INTEGER NOT NULL DEFAULT 10,
  off_hours_msg TEXT NOT NULL DEFAULT '',
  working_hours JSONB NOT NULL DEFAULT '{"start":"08:00","end":"18:00","days":[1,2,3,4,5]}'::jsonb,
  quick_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view whatsapp ai config" ON public.whatsapp_ai_config FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert whatsapp ai config" ON public.whatsapp_ai_config FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update whatsapp ai config" ON public.whatsapp_ai_config FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete whatsapp ai config" ON public.whatsapp_ai_config FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));

-- WhatsApp Quick Actions
CREATE TABLE public.whatsapp_quick_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '⚡',
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_index INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6d28d9'
);

CREATE INDEX idx_whatsapp_quick_actions_org ON public.whatsapp_quick_actions(org_id, order_index);

ALTER TABLE public.whatsapp_quick_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view whatsapp quick actions" ON public.whatsapp_quick_actions FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can insert whatsapp quick actions" ON public.whatsapp_quick_actions FOR INSERT WITH CHECK (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can update whatsapp quick actions" ON public.whatsapp_quick_actions FOR UPDATE USING (user_belongs_to_org(auth.uid(), org_id));
CREATE POLICY "Org members can delete whatsapp quick actions" ON public.whatsapp_quick_actions FOR DELETE USING (user_belongs_to_org(auth.uid(), org_id));
