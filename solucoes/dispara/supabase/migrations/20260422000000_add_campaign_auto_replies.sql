-- Auto-replies por campanha
-- quick_reply_responses: mapa { "Texto do botão" -> "Resposta automática" }
-- fallback_response: resposta enviada quando cliente responde com texto livre (não bate nenhum botão)
-- Contadores: observabilidade de efetividade das respostas automáticas

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS quick_reply_responses JSONB,
  ADD COLUMN IF NOT EXISTS fallback_response TEXT,
  ADD COLUMN IF NOT EXISTS auto_reply_sent_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quick_reply_match_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fallback_sent_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN campaigns.quick_reply_responses IS 'Mapa texto_do_botão -> resposta automática (quick_reply)';
COMMENT ON COLUMN campaigns.fallback_response IS 'Resposta automática quando cliente responde com texto livre';
COMMENT ON COLUMN campaigns.auto_reply_sent_count IS 'Total de auto-replies enviados com sucesso (quick + fallback)';
COMMENT ON COLUMN campaigns.quick_reply_match_count IS 'Auto-replies disparados por match em quick_reply button';
COMMENT ON COLUMN campaigns.fallback_sent_count IS 'Auto-replies disparados via fallback (texto livre)';

-- RPC para incremento atômico dos contadores de auto-reply
-- Uso: supabase.rpc('increment_campaign_auto_reply_counters', { p_campaign_id: '...', p_match_type: 'quick' | 'fallback' })
CREATE OR REPLACE FUNCTION public.increment_campaign_auto_reply_counters(
  p_campaign_id text,
  p_match_type text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_match_type NOT IN ('quick', 'fallback') THEN
    RAISE EXCEPTION 'Invalid match_type: %', p_match_type;
  END IF;

  UPDATE public.campaigns
  SET
    auto_reply_sent_count = auto_reply_sent_count + 1,
    quick_reply_match_count = quick_reply_match_count + CASE WHEN p_match_type = 'quick' THEN 1 ELSE 0 END,
    fallback_sent_count = fallback_sent_count + CASE WHEN p_match_type = 'fallback' THEN 1 ELSE 0 END
  WHERE id = p_campaign_id;
END;
$$;

COMMENT ON FUNCTION public.increment_campaign_auto_reply_counters IS
  'Incremento atômico dos contadores de auto-reply de campanha. match_type: quick | fallback';
