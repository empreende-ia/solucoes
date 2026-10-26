-- Três defeitos de fila corrigidos de uma vez:
--
-- 1. lara_processing_queue aceitava a MESMA mensagem duas vezes (duas execuções
--    do message-grouper convergindo no mesmo instante passavam juntas pelo
--    check-then-insert) — o lead recebia duas respostas para a mesma rajada.
--    O índice único parcial faz a segunda inserção falhar com 23505, que o
--    grouper trata como duplicata esperada.
--
-- 2/3. Os claims marcavam status='processing' e, se o isolate morresse no meio
--    do lote (limite de execução, reciclagem), o item ficava preso ali para
--    sempre: nenhum retry, nenhuma varredura, lead sem resposta / mensagem
--    nunca enviada. O claim agora funciona como lease: item 'processing' cujo
--    updated_at envelheceu é recuperado com retry_count+1; depois de 4
--    resgates vira 'failed' com erro explícito, em vez de looping eterno.

-- 1. Dedupe por mensagem enquanto ela está viva na fila.
--    (Antes do índice: colapsar duplicatas pendentes existentes, se houver.)
--    O DO abaixo roda LOCK + DELETE numa transação de statement único: uma
--    inserção entre o DELETE e o CREATE UNIQUE INDEX não aborta a migration
--    (num apply greenfield a fila está vazia e não há escritores de todo modo;
--    o CLI aplica statements em autocommit, por isso LOCK solto quebrava).
DO $mig$
BEGIN
  LOCK TABLE public.lara_processing_queue IN EXCLUSIVE MODE;
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY message_id ORDER BY created_at) AS rn
    FROM public.lara_processing_queue
    WHERE status IN ('pending', 'processing')
  )
  DELETE FROM public.lara_processing_queue
  WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
END;
$mig$;

CREATE UNIQUE INDEX IF NOT EXISTS lara_processing_queue_message_unique
  ON public.lara_processing_queue (message_id)
  WHERE status IN ('pending', 'processing');

-- 2. Lease no claim do orquestrador (itens levam até ~1 min cada; 10 min de
--    silêncio em 'processing' significa lote morto).
CREATE OR REPLACE FUNCTION public.claim_lara_processing_batch(p_limit INTEGER DEFAULT 50)
RETURNS SETOF lara_processing_queue AS $$
BEGIN
    -- Item resgatado demais é veneno (derruba o isolate toda vez): falha
    -- explícita em vez de loop eterno de resgates.
    UPDATE public.lara_processing_queue
    SET status = 'failed',
        error_message = 'Abandonado em processing repetidamente — provável falha estrutural no processamento deste item.',
        updated_at = now()
    WHERE status = 'processing'
      AND updated_at < now() - interval '10 minutes'
      AND retry_count >= 4;

    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.lara_processing_queue
        WHERE (
                status = 'pending'
                AND (scheduled_for IS NULL OR scheduled_for <= now())
              )
           OR (
                status = 'processing'
                AND updated_at < now() - interval '10 minutes'
                AND retry_count < 4
              )
        ORDER BY priority DESC, scheduled_for ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.lara_processing_queue n
    SET status = 'processing',
        updated_at = now(),
        retry_count = n.retry_count + CASE WHEN n.status = 'processing' THEN 1 ELSE 0 END
    WHERE n.id IN (SELECT id FROM cte)
    RETURNING n.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. Lease no claim do envio (envio é rápido; 5 min de 'processing' é lote
--    morto). Tradeoff assumido: lease é entrega at-least-once — um lote vivo
--    porém mais lento que o lease teria itens resgatados e reenviados. Os 5
--    minutos cobrem com folga o pior lote real (10 itens de envio HTTP); o
--    orquestrador, cujos itens são longos, renova o lease item a item.
CREATE OR REPLACE FUNCTION public.claim_send_queue_batch(p_limit INTEGER DEFAULT 10)
RETURNS SETOF send_queue AS $$
BEGIN
    -- O veneno também precisa aparecer no CHAT (mesma regra do catch do
    -- sender): sem isto a mensagem do operador ficaria 'processing' para
    -- sempre na interface, com a falha visível só na fila.
    WITH poisoned AS (
        UPDATE public.send_queue
        SET status = 'failed',
            error_message = 'Abandonado em processing repetidamente — provável falha estrutural no envio deste item.',
            updated_at = now()
        WHERE status = 'processing'
          AND updated_at < now() - interval '5 minutes'
          AND retry_count >= 4
        RETURNING message_id
    )
    UPDATE public.messages m
    SET status = 'failed',
        metadata = COALESCE(m.metadata, '{}'::jsonb)
          || jsonb_build_object('send_error', 'Envio abandonado após falhas repetidas.')
    WHERE m.id IN (SELECT message_id FROM poisoned WHERE message_id IS NOT NULL);

    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.send_queue
        WHERE (
                status = 'pending'
                AND (scheduled_at IS NULL OR scheduled_at <= now())
              )
           OR (
                status = 'processing'
                AND updated_at < now() - interval '5 minutes'
                AND retry_count < 4
              )
        ORDER BY priority DESC, scheduled_at ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.send_queue s
    SET status = 'processing',
        updated_at = now(),
        retry_count = s.retry_count + CASE WHEN s.status = 'processing' THEN 1 ELSE 0 END
    WHERE s.id IN (SELECT id FROM cte)
    RETURNING s.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
