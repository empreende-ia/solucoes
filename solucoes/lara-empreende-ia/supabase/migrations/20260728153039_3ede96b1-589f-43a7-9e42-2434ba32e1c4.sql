CREATE TABLE public.prompt_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content text NOT NULL,
  blocks jsonb NOT NULL DEFAULT '{}'::jsonb,
  label text,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  eval_run_id uuid REFERENCES public.eval_runs(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prompt_versions_source_check
    CHECK (source IN ('manual', 'gerador', 'conversas', 'onboarding', 'restauracao'))
);

CREATE INDEX prompt_versions_created_at_idx ON public.prompt_versions (created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.prompt_versions TO authenticated;
GRANT ALL ON public.prompt_versions TO service_role;

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler o historico de prompts"
ON public.prompt_versions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins podem criar versoes de prompt"
ON public.prompt_versions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem apagar versoes de prompt"
ON public.prompt_versions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));