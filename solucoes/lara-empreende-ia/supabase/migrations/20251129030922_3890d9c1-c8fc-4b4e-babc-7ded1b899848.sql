-- Inserir tags iniciais no sistema
INSERT INTO tag_definitions (key, label, color, category, is_active) VALUES
-- Status do Lead
('hot_lead', '🔥 Lead Quente', '#ef4444', 'status', true),
('warm_lead', '🌡️ Lead Morno', '#f97316', 'status', true),
('cold_lead', '❄️ Lead Frio', '#3b82f6', 'status', true),

-- Interesse
('interested', '✅ Interessado', '#22c55e', 'interest', true),
('not_interested', '❌ Sem Interesse', '#6b7280', 'interest', true),
('comparing', '🔄 Comparando', '#8b5cf6', 'interest', true),

-- Ação Necessária
('needs_followup', '📞 Follow-up', '#eab308', 'action', true),
('scheduled_demo', '📅 Demo Agendada', '#06b6d4', 'action', true),
('waiting_response', '⏳ Aguardando', '#a855f7', 'action', true),

-- Qualificação
('qualified', '⭐ Qualificado', '#10b981', 'qualification', true),
('disqualified', '🚫 Desqualificado', '#ef4444', 'qualification', true),

-- Custom
('vip', '👑 VIP', '#fbbf24', 'custom', true),
('urgent', '🚨 Urgente', '#dc2626', 'custom', true)
ON CONFLICT (key) DO NOTHING;