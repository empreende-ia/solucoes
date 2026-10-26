-- Limites duráveis e atômicos para operações de IA e tools. O contador vive
-- no banco para continuar válido entre instâncias/restarts das Edge Functions.
CREATE TABLE public.agent_operation_rate_limits (
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    subject_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    window_key BIGINT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, subject_key, operation, window_key),
    CHECK (char_length(subject_key) BETWEEN 1 AND 200),
    CHECK (char_length(operation) BETWEEN 1 AND 100)
);

ALTER TABLE public.agent_operation_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_agent_rate_limit(
    _workspace_id UUID,
    _subject_key TEXT,
    _operation TEXT,
    _max_requests INTEGER,
    _window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_window BIGINT;
    consumed INTEGER;
BEGIN
    IF _workspace_id IS NULL
       OR coalesce(char_length(trim(_subject_key)), 0) = 0
       OR coalesce(char_length(trim(_operation)), 0) = 0
       OR _max_requests < 1 OR _max_requests > 10000
       OR _window_seconds < 1 OR _window_seconds > 86400 THEN
        RAISE EXCEPTION 'Parâmetros inválidos para rate limit' USING ERRCODE = '22023';
    END IF;

    current_window := floor(extract(epoch FROM clock_timestamp()) / _window_seconds)::BIGINT;

    INSERT INTO public.agent_operation_rate_limits (
        workspace_id, subject_key, operation, window_key, request_count
    ) VALUES (
        _workspace_id, left(_subject_key, 200), left(_operation, 100), current_window, 1
    )
    ON CONFLICT (workspace_id, subject_key, operation, window_key)
    DO UPDATE SET
        request_count = public.agent_operation_rate_limits.request_count + 1,
        updated_at = now()
    WHERE public.agent_operation_rate_limits.request_count < _max_requests
    RETURNING request_count INTO consumed;

    -- Limpeza oportunista e limitada ao escopo atual.
    DELETE FROM public.agent_operation_rate_limits
     WHERE workspace_id = _workspace_id
       AND operation = left(_operation, 100)
       AND updated_at < now() - interval '2 days';

    RETURN consumed IS NOT NULL;
END;
$$;

REVOKE ALL ON public.agent_operation_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_operation_rate_limits TO service_role;
REVOKE ALL ON FUNCTION public.consume_agent_rate_limit(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_agent_rate_limit(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

ALTER TABLE public.agent_suggestions DROP CONSTRAINT IF EXISTS agent_suggestions_suggestion_type_check;
ALTER TABLE public.agent_suggestions ADD CONSTRAINT agent_suggestions_suggestion_type_check CHECK (suggestion_type IN (
    'new_fact', 'new_faq', 'new_example', 'new_test_scenario', 'commercial_rule',
    'tone_adjustment', 'handoff_rule', 'missing_material'
));
