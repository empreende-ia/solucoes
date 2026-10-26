import { useQuery } from '@tanstack/react-query';
import { crmDb } from '@/integrations/supabase/crm-client';
import type { CrmRow } from '@/integrations/supabase/commercial-types';
import { useOrg } from '@/hooks/useOrg';
import { useAuth } from '@/contexts/AuthContext';
import type { RelationshipData } from '@/lib/contact-model';
export interface CrmSnapshot extends RelationshipData {
  activities: CrmRow<'activities'>[];
  riskRules: CrmRow<'risk_rules'>[];
  pipelines: CrmRow<'pipelines'>[];
  stages: CrmRow<'pipeline_stages'>[];
}
const PAGE_SIZE = 500;
/** Fetches every page instead of treating the server response limit as a complete list. */
export async function readCrmPages<T>(request: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await request(from, from + PAGE_SIZE - 1); if (result.error) throw result.error;
    const page = (result.data ?? []) as T[]; rows.push(...page); if (page.length < PAGE_SIZE) return rows;
  }
}
export function useCrmSnapshot() {
  const { orgId } = useOrg(); const { user, loading } = useAuth();
  return useQuery<CrmSnapshot>({ queryKey: ['crm', orgId, 'snapshot', user?.id], enabled: !!orgId && !!user && !loading,
    queryFn: async () => {
      if (!orgId) throw new Error('Organização indisponível.');
      const [contacts, companies, deals, activities, members, riskRules, pipelines, stages] = await Promise.all([
        readCrmPages<CrmSnapshot['contacts'][number]>((from, to) => crmDb.from('contacts').select('*').eq('org_id', orgId).order('id').range(from, to)),
        readCrmPages<CrmSnapshot['companies'][number]>((from, to) => crmDb.from('companies').select('*').eq('org_id', orgId).order('id').range(from, to)),
        readCrmPages<CrmSnapshot['deals'][number]>((from, to) => crmDb.from('deals').select('*').eq('org_id', orgId).order('id').range(from, to)),
        readCrmPages<CrmSnapshot['activities'][number]>((from, to) => crmDb.from('activities').select('*').eq('org_id', orgId).order('id').range(from, to)),
        readCrmPages<CrmSnapshot['members'][number]>((from, to) => crmDb.from('profiles').select('id,name,email').eq('org_id', orgId).order('id').range(from, to)),
        readCrmPages<CrmSnapshot['riskRules'][number]>((from, to) => crmDb.from('risk_rules').select('*').eq('org_id', orgId).order('id').range(from, to)),
        readCrmPages<CrmSnapshot['pipelines'][number]>((from, to) => crmDb.from('pipelines').select('*').eq('org_id', orgId).order('id').range(from, to)),
        readCrmPages<CrmSnapshot['stages'][number]>((from, to) => crmDb.from('pipeline_stages').select('*').eq('org_id', orgId).order('id').range(from, to)),
      ]);
      return { contacts, companies, deals, activities, members, riskRules, pipelines, stages };
    }, staleTime: 30_000,
  });
}
