-- ============================================
-- SEED DATA PARA TORNAR PROJETO REMIX-READY
-- ============================================

-- Insere lara_settings padrão se não existir
INSERT INTO lara_settings (
  company_name, 
  sdr_name, 
  is_active, 
  auto_response_enabled, 
  ai_model_mode, 
  message_breaking_enabled, 
  adaptive_response_enabled,
  response_delay_min, 
  response_delay_max,
  business_hours_start, 
  business_hours_end, 
  business_days,
  timezone,
  openai_model,
  openai_assistant_id,
  elevenlabs_voice_id,
  elevenlabs_stability,
  elevenlabs_similarity_boost,
  elevenlabs_style,
  elevenlabs_speaker_boost,
  whatsapp_verify_token
)
SELECT 
  'Sua Empresa', 
  'Agente', 
  true, 
  true, 
  'flash', 
  true,
  true,
  1000, 
  3000,
  '09:00', 
  '18:00', 
  ARRAY[1,2,3,4,5],
  'America/Sao_Paulo',
  'gpt-4.1',
  'asst_X8XSK8rxKOLieSVQwOcvQTdZ',
  'alloy',
  0.75,
  0.80,
  0.30,
  true,
  'empreende-ia-lara-webhook'
WHERE NOT EXISTS (SELECT 1 FROM lara_settings LIMIT 1);

-- Insere pipeline_stages padrão se não existir
INSERT INTO pipeline_stages (title, color, position, is_system, is_ai_managed, is_active)
SELECT * FROM (VALUES
  ('Novo', 'border-slate-500', 0, false, false, true),
  ('Qualificação', 'border-blue-500', 1, false, true, true),
  ('Apresentação', 'border-violet-500', 2, false, true, true),
  ('Negociação', 'border-amber-500', 3, false, true, true),
  ('Ganho', 'border-emerald-500', 4, true, false, true),
  ('Perdido', 'border-red-500', 5, true, false, true)
) AS v(title, color, position, is_system, is_ai_managed, is_active)
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages LIMIT 1);

-- Insere tag_definitions padrão se não existir
INSERT INTO tag_definitions (key, label, color, category, is_active)
SELECT * FROM (VALUES
  ('hot_lead', 'Lead Quente', '#ef4444', 'status', true),
  ('cold_lead', 'Lead Frio', '#3b82f6', 'status', true),
  ('warm_lead', 'Lead Morno', '#f59e0b', 'status', true),
  ('qualified', 'Qualificado', '#22c55e', 'qualification', true),
  ('unqualified', 'Não Qualificado', '#6b7280', 'qualification', true),
  ('interested', 'Interessado', '#a855f7', 'interest', true),
  ('follow_up', 'Follow-up', '#06b6d4', 'action', true),
  ('demo_requested', 'Demo Solicitada', '#8b5cf6', 'action', true)
) AS v(key, label, color, category, is_active)
WHERE NOT EXISTS (SELECT 1 FROM tag_definitions LIMIT 1);