-- ============================================================================
-- SISTEMA DE CHAT WHATSAPP COM IA (LARA) - SCHEMA COMPLETO
-- ============================================================================

-- PARTE 1: EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PARTE 2: ENUMs
CREATE TYPE conversation_status AS ENUM ('lara', 'human', 'paused');
CREATE TYPE message_from AS ENUM ('user', 'lara', 'human');
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read', 'failed', 'processing');
CREATE TYPE message_type AS ENUM ('text', 'audio', 'image', 'document', 'video');
CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE team_assignment AS ENUM ('comercial', 'tecnico', 'operacional', 'vendas', 'suporte');

-- PARTE 3: TABELAS PRINCIPAIS

-- 3.1 CONTACTS
CREATE TABLE public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    whatsapp_id TEXT,
    name TEXT,
    call_name TEXT,
    email TEXT,
    profile_picture_url TEXT,
    is_business BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    blocked_at TIMESTAMPTZ,
    blocked_reason TEXT,
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    client_memory JSONB DEFAULT '{
        "last_updated": null,
        "lead_profile": {
            "interests": [],
            "lead_stage": "new",
            "objections": [],
            "products_discussed": [],
            "communication_style": "unknown",
            "qualification_score": 0
        },
        "sales_intelligence": {
            "pain_points": [],
            "next_best_action": "qualify",
            "budget_indication": "unknown",
            "decision_timeline": "unknown"
        },
        "interaction_summary": {
            "response_pattern": "unknown",
            "last_contact_reason": "",
            "total_conversations": 0,
            "preferred_contact_time": "unknown"
        },
        "conversation_history": []
    }'::jsonb,
    first_contact_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT contacts_phone_number_unique UNIQUE (phone_number)
);

CREATE INDEX idx_contacts_phone_number ON public.contacts(phone_number);
CREATE INDEX idx_contacts_whatsapp_id ON public.contacts(whatsapp_id);
CREATE INDEX idx_contacts_is_blocked ON public.contacts(is_blocked);
CREATE INDEX idx_contacts_last_activity ON public.contacts(last_activity DESC);
CREATE INDEX idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX idx_contacts_created_at ON public.contacts(created_at DESC);

-- 3.2 CONVERSATIONS
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    status conversation_status NOT NULL DEFAULT 'lara',
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_team team_assignment,
    assigned_user_id UUID,
    tags TEXT[] DEFAULT '{}',
    lara_context JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_is_active ON public.conversations(is_active);
CREATE INDEX idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
CREATE INDEX idx_conversations_tags ON public.conversations USING GIN(tags);
CREATE INDEX idx_conversations_created_at ON public.conversations(created_at DESC);

-- 3.3 MESSAGES
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES public.messages(id),
    whatsapp_message_id TEXT,
    type message_type NOT NULL DEFAULT 'text',
    from_type message_from NOT NULL,
    content TEXT,
    media_url TEXT,
    media_type TEXT,
    status message_status NOT NULL DEFAULT 'sent',
    processed_by_lara BOOLEAN DEFAULT false,
    lara_response_time INTEGER,
    metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_whatsapp_message_id ON public.messages(whatsapp_message_id);
CREATE INDEX idx_messages_from_type ON public.messages(from_type);
CREATE INDEX idx_messages_sent_at ON public.messages(sent_at DESC);
CREATE INDEX idx_messages_status ON public.messages(status);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- 3.4 CONVERSATION_STATES
CREATE TABLE public.conversation_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
    current_state TEXT NOT NULL DEFAULT 'idle',
    last_action TEXT,
    last_action_at TIMESTAMPTZ,
    scheduling_context JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_states_conversation_id ON public.conversation_states(conversation_id);
CREATE INDEX idx_conversation_states_current_state ON public.conversation_states(current_state);

-- PARTE 4: TABELAS DE FILAS

-- 4.1 MESSAGE_GROUPING_QUEUE
CREATE TABLE public.message_grouping_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_message_id TEXT NOT NULL,
    phone_number_id TEXT NOT NULL,
    message_data JSONB NOT NULL,
    contacts_data JSONB,
    processed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_grouping_queue_processed ON public.message_grouping_queue(processed);
CREATE INDEX idx_message_grouping_queue_phone_number_id ON public.message_grouping_queue(phone_number_id);
CREATE INDEX idx_message_grouping_queue_created_at ON public.message_grouping_queue(created_at);

-- 4.2 MESSAGE_PROCESSING_QUEUE
CREATE TABLE public.message_processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_message_id TEXT NOT NULL,
    phone_number_id TEXT NOT NULL,
    raw_data JSONB NOT NULL,
    status queue_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 1,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    scheduled_for TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_processing_queue_status ON public.message_processing_queue(status);
CREATE INDEX idx_message_processing_queue_scheduled_for ON public.message_processing_queue(scheduled_for);
CREATE INDEX idx_message_processing_queue_priority ON public.message_processing_queue(priority DESC);

-- 4.3 LARA_PROCESSING_QUEUE
CREATE TABLE public.lara_processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    context_data JSONB,
    status queue_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 1,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    scheduled_for TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lara_processing_queue_status ON public.lara_processing_queue(status);
CREATE INDEX idx_lara_processing_queue_message_id ON public.lara_processing_queue(message_id);
CREATE INDEX idx_lara_processing_queue_conversation_id ON public.lara_processing_queue(conversation_id);
CREATE INDEX idx_lara_processing_queue_scheduled_for ON public.lara_processing_queue(scheduled_for);
CREATE INDEX idx_lara_processing_queue_priority ON public.lara_processing_queue(priority DESC);

-- 4.4 SEND_QUEUE
CREATE TABLE public.send_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    from_type TEXT NOT NULL DEFAULT 'lara',
    content TEXT,
    media_url TEXT,
    metadata JSONB DEFAULT '{}',
    status queue_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 1,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    scheduled_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_send_queue_status ON public.send_queue(status);
CREATE INDEX idx_send_queue_contact_id ON public.send_queue(contact_id);
CREATE INDEX idx_send_queue_conversation_id ON public.send_queue(conversation_id);
CREATE INDEX idx_send_queue_scheduled_at ON public.send_queue(scheduled_at);
CREATE INDEX idx_send_queue_priority ON public.send_queue(priority DESC);

-- PARTE 5: TABELAS DE CONFIGURAÇÃO

-- 5.1 LARA_SETTINGS
CREATE TABLE public.lara_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    openai_api_key TEXT,
    openai_model TEXT NOT NULL DEFAULT 'gpt-4.1',
    openai_assistant_id TEXT NOT NULL DEFAULT 'asst_X8XSK8rxKOLieSVQwOcvQTdZ',
    system_prompt_override TEXT,
    test_system_prompt TEXT,
    elevenlabs_api_key TEXT,
    elevenlabs_voice_id TEXT NOT NULL DEFAULT 'alloy',
    elevenlabs_model TEXT DEFAULT 'eleven_turbo_v2_5',
    elevenlabs_stability NUMERIC NOT NULL DEFAULT 0.75,
    elevenlabs_similarity_boost NUMERIC NOT NULL DEFAULT 0.80,
    elevenlabs_style NUMERIC NOT NULL DEFAULT 0.30,
    elevenlabs_speaker_boost BOOLEAN NOT NULL DEFAULT true,
    elevenlabs_speed NUMERIC DEFAULT 1.0,
    whatsapp_access_token TEXT,
    whatsapp_phone_number_id TEXT,
    whatsapp_verify_token TEXT DEFAULT 'empreende-ia-lara-webhook',
    calcom_api_key TEXT,
    auto_response_enabled BOOLEAN NOT NULL DEFAULT true,
    adaptive_response_enabled BOOLEAN NOT NULL DEFAULT true,
    message_breaking_enabled BOOLEAN NOT NULL DEFAULT true,
    response_delay_min INTEGER NOT NULL DEFAULT 1000,
    response_delay_max INTEGER NOT NULL DEFAULT 3000,
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    business_hours_start TIME NOT NULL DEFAULT '09:00:00',
    business_hours_end TIME NOT NULL DEFAULT '18:00:00',
    business_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
    async_booking_enabled BOOLEAN DEFAULT false,
    route_all_to_receiver_enabled BOOLEAN NOT NULL DEFAULT false,
    test_phone_numbers JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lara_settings_is_active ON public.lara_settings(is_active);

INSERT INTO public.lara_settings (is_active) VALUES (true);

-- 5.2 TAG_DEFINITIONS
CREATE TABLE public.tag_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    category TEXT NOT NULL DEFAULT 'custom',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tag_definitions_key ON public.tag_definitions(key);
CREATE INDEX idx_tag_definitions_category ON public.tag_definitions(category);

-- PARTE 6: VIEW
CREATE OR REPLACE VIEW public.contacts_with_stats AS
SELECT 
    c.*,
    COALESCE(msg_stats.total_messages, 0) AS total_messages,
    COALESCE(msg_stats.lara_messages, 0) AS lara_messages,
    COALESCE(msg_stats.user_messages, 0) AS user_messages,
    COALESCE(msg_stats.human_messages, 0) AS human_messages
FROM public.contacts c
LEFT JOIN (
    SELECT 
        conv.contact_id,
        COUNT(m.id) AS total_messages,
        COUNT(CASE WHEN m.from_type = 'lara' THEN 1 END) AS lara_messages,
        COUNT(CASE WHEN m.from_type = 'user' THEN 1 END) AS user_messages,
        COUNT(CASE WHEN m.from_type = 'human' THEN 1 END) AS human_messages
    FROM public.conversations conv
    JOIN public.messages m ON m.conversation_id = conv.id
    GROUP BY conv.contact_id
) msg_stats ON msg_stats.contact_id = c.id;

-- PARTE 7: FUNÇÕES

-- 7.1 update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7.2 update_conversation_last_message
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations 
    SET last_message_at = NEW.sent_at
    WHERE id = NEW.conversation_id;
    
    UPDATE public.contacts 
    SET last_activity = NEW.sent_at
    WHERE id = (
        SELECT contact_id 
        FROM public.conversations 
        WHERE id = NEW.conversation_id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7.3 get_or_create_conversation_state
CREATE OR REPLACE FUNCTION public.get_or_create_conversation_state(p_conversation_id UUID)
RETURNS conversation_states AS $$
DECLARE
    state_record public.conversation_states;
BEGIN
    SELECT * INTO state_record
    FROM public.conversation_states
    WHERE conversation_id = p_conversation_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.conversation_states (conversation_id, current_state)
        VALUES (p_conversation_id, 'idle')
        RETURNING * INTO state_record;
    END IF;
    
    RETURN state_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.4 update_conversation_state
CREATE OR REPLACE FUNCTION public.update_conversation_state(
    p_conversation_id UUID, 
    p_new_state TEXT, 
    p_action TEXT DEFAULT NULL, 
    p_context JSONB DEFAULT NULL
)
RETURNS conversation_states AS $$
DECLARE
    state_record public.conversation_states;
BEGIN
    INSERT INTO public.conversation_states (
        conversation_id, current_state, last_action, last_action_at, scheduling_context
    )
    VALUES (
        p_conversation_id, p_new_state, p_action, now(), COALESCE(p_context, '{}')
    )
    ON CONFLICT (conversation_id) 
    DO UPDATE SET
        current_state = EXCLUDED.current_state,
        last_action = EXCLUDED.last_action,
        last_action_at = EXCLUDED.last_action_at,
        scheduling_context = CASE 
            WHEN EXCLUDED.scheduling_context = '{}' THEN conversation_states.scheduling_context
            ELSE EXCLUDED.scheduling_context
        END,
        updated_at = now()
    RETURNING * INTO state_record;
    
    RETURN state_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.5 update_client_memory
CREATE OR REPLACE FUNCTION public.update_client_memory(p_contact_id UUID, p_new_memory JSONB)
RETURNS VOID AS $$
BEGIN
    UPDATE public.contacts 
    SET client_memory = p_new_memory, updated_at = now()
    WHERE id = p_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7.6 claim_lara_processing_batch
CREATE OR REPLACE FUNCTION public.claim_lara_processing_batch(p_limit INTEGER DEFAULT 50)
RETURNS SETOF lara_processing_queue AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.lara_processing_queue
        WHERE status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= now())
        ORDER BY priority DESC, scheduled_for ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.lara_processing_queue n
    SET status = 'processing', updated_at = now()
    WHERE n.id IN (SELECT id FROM cte)
    RETURNING n.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7.7 claim_send_queue_batch
CREATE OR REPLACE FUNCTION public.claim_send_queue_batch(p_limit INTEGER DEFAULT 10)
RETURNS SETOF send_queue AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.send_queue
        WHERE status = 'pending'
          AND (scheduled_at IS NULL OR scheduled_at <= now())
        ORDER BY priority DESC, scheduled_at ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.send_queue s
    SET status = 'processing', updated_at = now()
    WHERE s.id IN (SELECT id FROM cte)
    RETURNING s.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7.8 claim_message_processing_batch
CREATE OR REPLACE FUNCTION public.claim_message_processing_batch(p_limit INTEGER DEFAULT 50)
RETURNS SETOF message_processing_queue AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.message_processing_queue
        WHERE status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= now())
        ORDER BY priority DESC, scheduled_for ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.message_processing_queue m
    SET status = 'processing', updated_at = now()
    WHERE m.id IN (SELECT id FROM cte)
    RETURNING m.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7.9 cleanup_processed_queues
CREATE OR REPLACE FUNCTION public.cleanup_processed_queues()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.message_processing_queue 
    WHERE status = 'completed' AND processed_at < now() - interval '24 hours';
    
    DELETE FROM public.lara_processing_queue 
    WHERE status = 'completed' AND processed_at < now() - interval '24 hours';
    
    DELETE FROM public.send_queue 
    WHERE status = 'completed' AND sent_at < now() - interval '24 hours';
    
    DELETE FROM public.message_processing_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
    
    DELETE FROM public.lara_processing_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
    
    DELETE FROM public.send_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql;

-- 7.10 cleanup_processed_message_queue
CREATE OR REPLACE FUNCTION public.cleanup_processed_message_queue()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.message_grouping_queue 
    WHERE processed = true AND created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- PARTE 8: TRIGGERS

-- 8.1 Triggers de updated_at
CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversation_states_updated_at
    BEFORE UPDATE ON public.conversation_states
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lara_processing_queue_updated_at
    BEFORE UPDATE ON public.lara_processing_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_message_processing_queue_updated_at
    BEFORE UPDATE ON public.message_processing_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_send_queue_updated_at
    BEFORE UPDATE ON public.send_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lara_settings_updated_at
    BEFORE UPDATE ON public.lara_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tag_definitions_updated_at
    BEFORE UPDATE ON public.tag_definitions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8.2 Trigger para atualizar last_message_at
CREATE TRIGGER update_conversation_last_message_trigger
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

-- PARTE 9: RLS

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_grouping_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lara_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lara_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_definitions ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas
CREATE POLICY "Allow all operations on contacts" ON public.contacts
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on conversations" ON public.conversations
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on messages" ON public.messages
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on conversation_states" ON public.conversation_states
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on message_grouping_queue" ON public.message_grouping_queue
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on message_processing_queue" ON public.message_processing_queue
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on lara_processing_queue" ON public.lara_processing_queue
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on send_queue" ON public.send_queue
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on lara_settings" ON public.lara_settings
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on tag_definitions" ON public.tag_definitions
    FOR ALL USING (true) WITH CHECK (true);

-- PARTE 10: REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;