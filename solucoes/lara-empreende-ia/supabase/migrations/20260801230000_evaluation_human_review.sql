-- O julgamento automático pode errar nas duas direções: acusar um comportamento
-- que o operador aprova e aprovar um que ele reprova. Esta migration guarda a
-- palavra humana sobre cada resultado e o aceite durável do cenário.
--
-- A nota fica no resultado, amarrada à resposta exata daquela rodada — é a prova.
-- O aceite fica no cenário, porque precisa sobreviver à regeração que a lara-eval
-- faz a cada rodada. O `is_active` não serve: ele é reescrito no upsert.

ALTER TABLE public.eval_results
    ADD COLUMN reviewer_verdict TEXT
        CHECK (reviewer_verdict IS NULL OR reviewer_verdict IN ('keep', 'reject', 'neutral')),
    ADD COLUMN reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN reviewed_at TIMESTAMPTZ;

ALTER TABLE public.golden_cases
    ADD COLUMN accepted_at TIMESTAMPTZ,
    ADD COLUMN accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.golden_cases.accepted_at IS
    'Aceite durável do operador: o alerta continua sendo gerado, mas sai da fila de atenção.';

ALTER TABLE public.eval_runs
    ADD COLUMN accepted_warnings INTEGER NOT NULL DEFAULT 0
        CHECK (accepted_warnings >= 0);

-- O GRANT de eval_runs é por coluna (test_prompt fica fora por privilégio). Coluna
-- nova nasce sem permissão, e o SELECT do painel falha inteiro se ela não entrar.
GRANT SELECT (accepted_warnings) ON public.eval_runs TO authenticated;

CREATE INDEX golden_cases_workspace_accepted_idx
    ON public.golden_cases (workspace_id)
    WHERE accepted_at IS NOT NULL;

-- authenticated só tem SELECT em eval_results; a escrita passa por aqui para
-- validar permissão, manter nota e aceite consistentes e registrar auditoria.
CREATE OR REPLACE FUNCTION public.review_evaluation_result(
    _result_id UUID,
    _verdict TEXT,
    _accept_scenario BOOLEAN DEFAULT false
)
RETURNS public.eval_results
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result public.eval_results;
    scenario public.golden_cases;
    agent_record public.agents;
BEGIN
    IF _verdict NOT IN ('keep', 'reject', 'neutral') THEN
        RAISE EXCEPTION 'Veredito inválido' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO result FROM public.eval_results WHERE id = _result_id FOR UPDATE;
    IF result.id IS NULL OR NOT public.can_edit_agent(result.workspace_id) THEN
        RAISE EXCEPTION 'Resultado não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    -- Aceitar só faz sentido quando o operador aprova o comportamento.
    IF _accept_scenario AND _verdict <> 'keep' THEN
        RAISE EXCEPTION 'Só é possível aceitar um cenário ao marcar que o comportamento pode ser mantido'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.eval_results
       SET reviewer_verdict = _verdict,
           reviewed_by = auth.uid(),
           reviewed_at = now()
     WHERE id = _result_id
     RETURNING * INTO result;

    SELECT * INTO scenario FROM public.golden_cases WHERE id = result.case_id FOR UPDATE;
    IF scenario.id IS NOT NULL THEN
        IF _accept_scenario THEN
            UPDATE public.golden_cases
               SET accepted_at = now(), accepted_by = auth.uid()
             WHERE id = scenario.id;
        ELSIF _verdict <> 'keep' AND scenario.accepted_at IS NOT NULL THEN
            -- Mudou de ideia: o aceite anterior não pode sobreviver a uma reprovação.
            UPDATE public.golden_cases
               SET accepted_at = NULL, accepted_by = NULL
             WHERE id = scenario.id;
        END IF;
    END IF;

    SELECT * INTO agent_record FROM public.agents WHERE workspace_id = result.workspace_id LIMIT 1;
    IF agent_record.id IS NOT NULL THEN
        INSERT INTO public.agent_audit_log (
            workspace_id, agent_id, actor_user_id, action, entity_type, entity_id, metadata
        ) VALUES (
            result.workspace_id, agent_record.id, auth.uid(),
            'agent.evaluation_result_reviewed', 'eval_result', result.id,
            jsonb_build_object(
                'verdict', _verdict,
                'acceptedScenario', _accept_scenario,
                'caseId', result.case_id,
                'runId', result.run_id
            )
        );
    END IF;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.review_evaluation_result(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_evaluation_result(UUID, TEXT, BOOLEAN) TO authenticated;
