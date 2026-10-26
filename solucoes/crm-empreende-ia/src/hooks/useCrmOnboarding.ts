import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { crmDb } from '@/integrations/supabase/crm-client';
import { emptySetupEvidence, type SetupEvidence, type SetupStatus } from '@/components/onboarding/setup-state';

type Check = PromiseSettledResult<{ data: unknown; error: unknown }>;
function existence(result: Check): SetupStatus {
  if (result.status === 'rejected' || result.value.error) return 'error';
  return Array.isArray(result.value.data) && result.value.data.length > 0 ? 'done' : 'pending';
}
function named(result: Check): SetupStatus {
  if (result.status === 'rejected' || result.value.error) return 'error';
  const data = result.value.data as { name?: string } | null;
  return data?.name?.trim() ? 'done' : 'pending';
}
function both(a: SetupStatus, b: SetupStatus): SetupStatus {
  return a === 'error' || b === 'error' ? 'error' : a === 'done' && b === 'done' ? 'done' : 'pending';
}
function scheduledAction(result: Check): SetupStatus {
  if (result.status === 'rejected' || result.value.error) return 'error';
  // Same eligibility as the canonical nextAction: pending, not a note, finite deadline.
  const rows = result.value.data as { type: string; completed_at: string | null; due_date: string | null }[] | null;
  return rows?.some(row => !row.completed_at && row.type !== 'note' && row.due_date && Number.isFinite(Date.parse(row.due_date))) ? 'done' : 'pending';
}

/** Read-only checks: no onboarding_completed flags and no synthetic records. */
export async function fetchSetupEvidence(orgId: string, userId: string, signal: AbortSignal): Promise<SetupEvidence> {
  const [organization, profile, pipelines, stages, contacts, deals, activities] = await Promise.allSettled([
    crmDb.from('organizations').select('name').eq('id', orgId).abortSignal(signal).maybeSingle(),
    crmDb.from('profiles').select('name').eq('id', userId).eq('org_id', orgId).abortSignal(signal).maybeSingle(),
    crmDb.from('pipelines').select('id').eq('org_id', orgId).limit(1).abortSignal(signal),
    crmDb.from('pipeline_stages').select('id').eq('org_id', orgId).limit(1).abortSignal(signal),
    crmDb.from('contacts').select('id').eq('org_id', orgId).limit(1).abortSignal(signal),
    crmDb.from('deals').select('id').eq('org_id', orgId).limit(1).abortSignal(signal),
    crmDb.from('activities').select('id,type,due_date,completed_at').eq('org_id', orgId)
      .is('completed_at', null).neq('type', 'note').not('due_date', 'is', null).limit(1).abortSignal(signal),
  ]);
  return {
    identity: both(named(organization), named(profile)),
    pipeline: both(existence(pipelines), existence(stages)),
    contact: existence(contacts), opportunity: existence(deals), activity: scheduledAction(activities),
  };
}

export function useCrmOnboarding() {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const query = useQuery({
    queryKey: ['crm', orgId, 'onboarding-evidence', user?.id],
    enabled: Boolean(user?.id && orgId),
    queryFn: ({ signal }) => fetchSetupEvidence(orgId!, user!.id, signal),
    staleTime: 15_000,
    retry: false,
  });
  const evidence = query.data ?? emptySetupEvidence();
  return {
    evidence, loading: query.isPending, refreshing: query.isFetching,
    completed: Object.values(evidence).filter((status) => status === 'done').length,
    hasError: query.isError || Object.values(evidence).some((status) => status === 'error'),
    refresh: query.refetch,
  };
}
