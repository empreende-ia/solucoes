-- Training Studio: golden set + avaliações automatizadas.
-- golden_cases: casos de teste com comportamento esperado VERIFICÁVEL
--   (responder com a base / recusar sem inventar / encaminhar pra humano / agendar via tool).
-- eval_runs / eval_results: rodadas de avaliação executadas pela edge function
--   lara-eval (mesmo motor da produção em dry-run + juiz LLM com rubrica pt-BR).

-- ============================================================
-- 1. Golden set
-- ============================================================
CREATE TABLE public.golden_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    expected_behavior TEXT NOT NULL
        CHECK (expected_behavior IN ('responder', 'recusar', 'transferir', 'agendar')),
    expected_content TEXT,
    category TEXT NOT NULL DEFAULT 'factual'
        CHECK (category IN ('factual', 'dificil', 'fora_de_escopo', 'adversarial', 'emocional')),
    origin TEXT NOT NULL DEFAULT 'manual'
        CHECK (origin IN ('manual', 'simulador', 'duvida', 'recomendado')),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_golden_cases_active ON public.golden_cases (created_at) WHERE is_active;

-- ============================================================
-- 2. Rodadas de avaliação
-- ============================================================
CREATE TABLE public.eval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed')),
    total_cases INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    errored INTEGER NOT NULL DEFAULT 0,
    prompt_source TEXT NOT NULL DEFAULT 'atual'
        CHECK (prompt_source IN ('atual', 'alternativo')),
    test_prompt TEXT,
    model_mode TEXT,
    started_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE public.eval_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.eval_runs(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.golden_cases(id) ON DELETE SET NULL,
    -- snapshot do caso no momento da rodada (o caso pode ser editado depois)
    query TEXT NOT NULL,
    expected_behavior TEXT NOT NULL,
    expected_content TEXT,
    category TEXT NOT NULL,
    reply TEXT,
    grounding JSONB,
    verdict TEXT NOT NULL CHECK (verdict IN ('aprovado', 'reprovado', 'erro')),
    judge_reason TEXT,
    latency_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, case_id)
);

-- (consultas por run_id são cobertas pelo índice da UNIQUE(run_id, case_id))
CREATE INDEX idx_eval_runs_created ON public.eval_runs (created_at DESC);

-- ============================================================
-- 3. RLS: leitura para autenticados; golden_cases gerido por admin;
--    eval_runs/eval_results escritos apenas pela edge function (service role).
-- ============================================================
ALTER TABLE public.golden_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read golden_cases"
    ON public.golden_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage golden_cases"
    ON public.golden_cases FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read eval_runs"
    ON public.eval_runs FOR SELECT TO authenticated USING (true);
-- eval_results guarda a resposta gerada em testes adversariais — quando o teste
-- FALHA, reply/grounding podem conter dump de prompt ou dado sensível. Só admin lê.
CREATE POLICY "Admins can read eval_results"
    ON public.eval_results FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
-- sem policy de escrita: só o service role (edge function) grava rodadas/resultados

-- test_prompt pode conter variação do prompt da Lara (hoje restrito a admin via
-- lara_settings). Privilégio de coluna: authenticated lê a rodada, não o prompt.
-- (o front seleciona colunas explícitas; a edge function usa service role)
REVOKE SELECT ON public.eval_runs FROM authenticated, anon;
GRANT SELECT (id, status, total_cases, passed, failed, errored, prompt_source, model_mode, created_at, finished_at)
    ON public.eval_runs TO authenticated;

CREATE TRIGGER update_golden_cases_updated_at
    BEFORE UPDATE ON public.golden_cases
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
