-- Placar de entrega da Lara.
--
-- O dashboard de hoje responde "quanto mexeu" (conversas com atividade, deals
-- ganhos somados a agendamentos, tempo médio de resposta) e nunca responde a
-- única pergunta que decide se o produto continua ligado: **a Lara está
-- entregando?**. Atendimento conta conversa que um humano respondeu; conversão
-- soma o que a pessoa fechou na mão com o que a agente agendou; e o que falha
-- na fila — lead sem resposta nenhuma — não aparece em lugar nenhum.
--
-- Esta migration cria uma leitura agregada, por período e já comparada com o
-- período anterior, com atribuição explícita:
--
--   conversas       · quantos leads a Lara atendeu (recebeu mensagem do lead)
--   sem_humano      · quantas a Lara conduziu sozinha, do começo ao fim
--   com_agendamento · quantas viraram agendamento na agenda
--   mediana         · quanto o lead esperou pela primeira resposta da Lara
--   falhas_na_fila  · quantas mensagens morreram antes de virar resposta
--
-- Agregação no banco, não no navegador: o painel de observabilidade atual puxa
-- até mil eventos para calcular percentil em JavaScript, e isso não escala nem
-- sobrevive a paginação.
--
-- Regras de contagem, todas deliberadas e visíveis na interface:
--   · conversa de teste (metadata->>'test' = 'true') não entra em nada. O lead
--     de teste é a sonda do dono, não entrega;
--   · "sem humano" exige resposta da Lara E nenhuma mensagem humana em toda a
--     conversa. Conversa que ninguém respondeu não é autonomia, é abandono;
--   · a mediana usa percentile_cont sobre a primeira resposta de cada conversa,
--     não a média: um único item preso na fila por três horas move a média e
--     não move a mediana;
--   · "virou agendamento" olha a agenda, não quem marcou: conta o agendamento
--     criado para o contato daquela conversa dentro da janela, seja pela
--     ferramenta da agente, seja por alguém do time. Atribuição por ator sai de
--     agent_action_runs e fica para o painel de saúde da resposta.

-- ============================================================
-- 1. Índices que sustentam a agregação
-- ============================================================
-- A janela varre messages por tipo e data, e depois volta por conversa para
-- achar a primeira resposta e detectar mensagem humana.
CREATE INDEX IF NOT EXISTS idx_messages_from_type_created
    ON public.messages (from_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_from_created
    ON public.messages (conversation_id, from_type, created_at);

-- Agendamento é resolvido pelo contato da conversa dentro da janela.
CREATE INDEX IF NOT EXISTS idx_appointments_contact_created
    ON public.appointments (contact_id, created_at DESC);

-- Falha de fila é lida por status dentro da janela.
CREATE INDEX IF NOT EXISTS idx_lara_queue_status_created
    ON public.lara_processing_queue (status, created_at DESC);

-- ============================================================
-- 2. O placar
-- ============================================================
-- SECURITY DEFINER porque lara_processing_queue não tem policy de leitura para
-- authenticated desde o hardening de 24/jul — e não deve voltar a ter: a fila
-- guarda o contexto bruto de toda a operação. Aqui sai apenas a contagem, e
-- apenas do workspace de quem chama.
CREATE OR REPLACE FUNCTION public.lara_delivery_scoreboard(_days INTEGER DEFAULT 7)
RETURNS TABLE (
    periodo                            TEXT,
    inicio                             TIMESTAMPTZ,
    fim                                TIMESTAMPTZ,
    conversas                          INTEGER,
    sem_humano                         INTEGER,
    com_agendamento                    INTEGER,
    mediana_primeira_resposta_segundos INTEGER,
    falhas_na_fila                     INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_days         INTEGER := LEAST(GREATEST(COALESCE(_days, 7), 1), 90);
    v_agora        TIMESTAMPTZ := now();
    v_inicio       TIMESTAMPTZ;
    v_anterior     TIMESTAMPTZ;
BEGIN
    -- Autorização: current_workspace_id() só devolve workspace de membership
    -- ativa do próprio auth.uid(). Sem vínculo, não há placar.
    v_workspace_id := public.current_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Sem vínculo ativo com um workspace' USING ERRCODE = '42501';
    END IF;

    v_inicio   := v_agora - make_interval(days => v_days);
    v_anterior := v_agora - make_interval(days => v_days * 2);

    RETURN QUERY
    WITH janelas AS (
        SELECT 'atual'::TEXT AS janela, v_inicio AS de, v_agora AS ate
        UNION ALL
        SELECT 'anterior'::TEXT, v_anterior, v_inicio
    ),
    -- Conversa atendida = recebeu ao menos uma mensagem do lead na janela.
    -- Não é "conversa com atividade": resposta nossa sozinha não é atendimento.
    atendidas AS (
        SELECT j.janela,
               j.de,
               j.ate,
               c.id         AS conversation_id,
               c.contact_id AS contact_id,
               min(m.created_at) AS primeira_do_lead
          FROM janelas j
          JOIN public.messages m
            ON m.from_type = 'user'
           AND m.created_at >= j.de
           AND m.created_at <  j.ate
          JOIN public.conversations c
            ON c.id = m.conversation_id
         WHERE c.workspace_id = v_workspace_id
           AND COALESCE(c.metadata ->> 'test', '') <> 'true'
         GROUP BY j.janela, j.de, j.ate, c.id, c.contact_id
    ),
    detalhe AS (
        SELECT a.janela,
               a.primeira_do_lead,
               (SELECT min(r.created_at)
                  FROM public.messages r
                 WHERE r.conversation_id = a.conversation_id
                   AND r.from_type = 'lara'
                   AND r.created_at >= a.primeira_do_lead) AS primeira_da_lara,
               EXISTS (
                   SELECT 1
                     FROM public.messages h
                    WHERE h.conversation_id = a.conversation_id
                      AND h.from_type = 'human'
               ) AS teve_humano,
               EXISTS (
                   SELECT 1
                     FROM public.appointments ap
                    WHERE ap.contact_id = a.contact_id
                      AND ap.workspace_id = v_workspace_id
                      AND ap.created_at >= a.de
                      AND ap.created_at <  a.ate
               ) AS virou_agendamento
          FROM atendidas a
    ),
    agregado AS (
        SELECT d.janela,
               count(*)::INTEGER AS conversas,
               count(*) FILTER (
                   WHERE NOT d.teve_humano AND d.primeira_da_lara IS NOT NULL
               )::INTEGER AS sem_humano,
               count(*) FILTER (WHERE d.virou_agendamento)::INTEGER AS com_agendamento,
               percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (d.primeira_da_lara - d.primeira_do_lead))::DOUBLE PRECISION
               ) FILTER (WHERE d.primeira_da_lara IS NOT NULL) AS mediana_segundos
          FROM detalhe d
         GROUP BY d.janela
    ),
    -- Falha de fila é contada pelo momento de entrada na fila: o item nasce
    -- junto com a mensagem do lead, então cai na mesma janela do atendimento.
    falhas AS (
        SELECT j.janela,
               count(*)::INTEGER AS falhas_na_fila
          FROM janelas j
          JOIN public.lara_processing_queue q
            ON q.status = 'failed'
           AND q.created_at >= j.de
           AND q.created_at <  j.ate
          JOIN public.conversations c
            ON c.id = q.conversation_id
         WHERE c.workspace_id = v_workspace_id
           AND COALESCE(c.metadata ->> 'test', '') <> 'true'
         GROUP BY j.janela
    )
    SELECT j.janela,
           j.de,
           j.ate,
           COALESCE(a.conversas, 0),
           COALESCE(a.sem_humano, 0),
           COALESCE(a.com_agendamento, 0),
           CASE WHEN a.mediana_segundos IS NULL
                THEN NULL
                ELSE round(a.mediana_segundos)::INTEGER
           END,
           COALESCE(f.falhas_na_fila, 0)
      FROM janelas j
      LEFT JOIN agregado a ON a.janela = j.janela
      LEFT JOIN falhas   f ON f.janela = j.janela
     ORDER BY CASE j.janela WHEN 'atual' THEN 0 ELSE 1 END;
END;
$$;

COMMENT ON FUNCTION public.lara_delivery_scoreboard(INTEGER) IS
    'Placar de entrega do workspace do usuário: duas linhas (atual e anterior) '
    'com conversas atendidas, conduzidas sem humano, viradas em agendamento, '
    'mediana da primeira resposta em segundos e falhas de fila. '
    'Conversas de teste ficam de fora.';

REVOKE ALL ON FUNCTION public.lara_delivery_scoreboard(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lara_delivery_scoreboard(INTEGER) TO authenticated, service_role;
