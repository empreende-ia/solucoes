
-- Reset onboarding: limpar dados criados em tentativas anteriores
DELETE FROM public.pipeline_stages WHERE org_id IN (SELECT id FROM public.organizations);
DELETE FROM public.pipelines WHERE org_id IN (SELECT id FROM public.organizations);
DELETE FROM public.integration_configs WHERE org_id IN (SELECT id FROM public.organizations);
DELETE FROM public.org_secrets WHERE org_id IN (SELECT id FROM public.organizations);
DELETE FROM public.onboarding_progress WHERE org_id IN (SELECT id FROM public.organizations);

-- Reset profiles
UPDATE public.profiles SET onboarding_completed = false, onboarding_step = 1;

-- Reset organizations to default state
UPDATE public.organizations SET name = 'Minha Empresa', settings = '{}';
