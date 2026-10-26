-- Evolui o antigo "golden set" para situações de teste versionadas por
-- workspace e conecta cada rodada ao rascunho exato que foi avaliado.

ALTER TABLE public.golden_cases
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD COLUMN title TEXT,
    ADD COLUMN scenario_key TEXT,
    ADD COLUMN severity TEXT NOT NULL DEFAULT 'warning'
        CHECK (severity IN ('critical', 'warning')),
    ADD COLUMN messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN source_rule TEXT;

ALTER TABLE public.eval_runs
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD COLUMN agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
    ADD COLUMN draft_id UUID REFERENCES public.agent_drafts(id) ON DELETE SET NULL,
    ADD COLUMN draft_revision INTEGER,
    ADD COLUMN compiler_version TEXT,
    ADD COLUMN config_snapshot JSONB,
    ADD COLUMN critical_failures INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN warnings INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN unstable INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN technical_failures INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN gate_status TEXT NOT NULL DEFAULT 'blocked'
        CHECK (gate_status IN ('passed', 'warnings', 'blocked', 'technical_failure'));

ALTER TABLE public.eval_results
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD COLUMN severity TEXT NOT NULL DEFAULT 'warning'
        CHECK (severity IN ('critical', 'warning')),
    ADD COLUMN result_status TEXT NOT NULL DEFAULT 'not_run'
        CHECK (result_status IN ('passed', 'warning', 'critical_failure', 'unstable', 'not_run', 'technical_failure')),
    ADD COLUMN checker_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0);

UPDATE public.golden_cases
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at LIMIT 1),
    title = COALESCE(NULLIF(trim(notes), ''), left(query, 120))
WHERE workspace_id IS NULL;

UPDATE public.eval_runs run
SET workspace_id = agent.workspace_id,
    agent_id = agent.id,
    draft_id = draft.id,
    draft_revision = draft.revision
FROM public.agents agent
JOIN public.agent_drafts draft ON draft.agent_id = agent.id
WHERE run.workspace_id IS NULL;

UPDATE public.eval_results result
SET workspace_id = run.workspace_id,
    severity = COALESCE(
        (SELECT scenario.severity FROM public.golden_cases scenario WHERE scenario.id = result.case_id),
        'warning'
    ),
    result_status = CASE result.verdict
        WHEN 'aprovado' THEN 'passed'
        WHEN 'reprovado' THEN CASE WHEN COALESCE(
            (SELECT scenario.severity FROM public.golden_cases scenario WHERE scenario.id = result.case_id),
            'warning'
        ) = 'critical' THEN 'critical_failure' ELSE 'warning' END
        ELSE 'technical_failure'
    END
FROM public.eval_runs run
WHERE result.run_id = run.id AND result.workspace_id IS NULL;

ALTER TABLE public.golden_cases ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.golden_cases ALTER COLUMN title SET NOT NULL;
ALTER TABLE public.eval_runs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.eval_runs ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.eval_results ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.golden_cases DROP CONSTRAINT IF EXISTS golden_cases_expected_behavior_check;
ALTER TABLE public.golden_cases ADD CONSTRAINT golden_cases_expected_behavior_check
    CHECK (expected_behavior IN ('responder', 'recusar', 'transferir', 'agendar', 'opt_out'));

ALTER TABLE public.golden_cases DROP CONSTRAINT IF EXISTS golden_cases_category_check;
ALTER TABLE public.golden_cases ADD CONSTRAINT golden_cases_category_check
    CHECK (category IN ('factual', 'dificil', 'fora_de_escopo', 'adversarial', 'emocional', 'acao', 'seguranca', 'handoff'));

ALTER TABLE public.golden_cases DROP CONSTRAINT IF EXISTS golden_cases_origin_check;
ALTER TABLE public.golden_cases ADD CONSTRAINT golden_cases_origin_check
    CHECK (origin IN ('manual', 'simulador', 'duvida', 'recomendado', 'automatico'));

CREATE UNIQUE INDEX golden_cases_workspace_scenario_key_unique
    ON public.golden_cases (workspace_id, scenario_key);
CREATE INDEX golden_cases_workspace_active_idx
    ON public.golden_cases (workspace_id, severity, created_at)
    WHERE is_active;
CREATE INDEX eval_runs_workspace_created_idx
    ON public.eval_runs (workspace_id, created_at DESC);
CREATE INDEX eval_results_workspace_run_idx
    ON public.eval_results (workspace_id, run_id, result_status);

DROP POLICY IF EXISTS "Authenticated can read golden_cases" ON public.golden_cases;
DROP POLICY IF EXISTS "Admins can manage golden_cases" ON public.golden_cases;
CREATE POLICY evaluation_scenarios_workspace_read ON public.golden_cases
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY evaluation_scenarios_workspace_write ON public.golden_cases
    FOR ALL TO authenticated
    USING (public.can_edit_agent(workspace_id))
    WITH CHECK (public.can_edit_agent(workspace_id));

DROP POLICY IF EXISTS "Authenticated can read eval_runs" ON public.eval_runs;
CREATE POLICY evaluation_runs_workspace_read ON public.eval_runs
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Admins can read eval_results" ON public.eval_results;
CREATE POLICY evaluation_results_workspace_read ON public.eval_results
    FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

REVOKE ALL ON public.golden_cases, public.eval_runs, public.eval_results
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golden_cases TO authenticated;
GRANT SELECT (
    id, workspace_id, agent_id, draft_id, draft_revision, status, total_cases,
    passed, failed, errored, prompt_source, model_mode, compiler_version,
    critical_failures, warnings, unstable, technical_failures, gate_status,
    created_at, finished_at
) ON public.eval_runs TO authenticated;
GRANT SELECT ON public.eval_results TO authenticated;
GRANT ALL ON public.golden_cases, public.eval_runs, public.eval_results TO service_role;
