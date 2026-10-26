-- Add monthly clinic-goal columns to health_goals so the Metas page can store goal_type/period_month/period_year alongside per-patient goals
ALTER TABLE public.health_goals
  ADD COLUMN IF NOT EXISTS goal_type    text,
  ADD COLUMN IF NOT EXISTS period_month smallint,
  ADD COLUMN IF NOT EXISTS period_year  smallint,
  ADD COLUMN IF NOT EXISTS user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- title is required by current schema but monthly goals don't need it; relax + provide default
ALTER TABLE public.health_goals ALTER COLUMN title DROP NOT NULL;

-- defaults for current_value so inserts that omit it are safe
ALTER TABLE public.health_goals ALTER COLUMN current_value SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS health_goals_period_idx
  ON public.health_goals (org_id, period_year DESC, period_month DESC);