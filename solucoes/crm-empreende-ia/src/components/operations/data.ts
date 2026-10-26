import { crmDb } from '@/integrations/supabase/crm-client';
import { allRows } from '@/components/pipeline/data';
export { allRows, errorMessage } from '@/components/pipeline/data';

export async function loadOperationReferences(orgId: string) {
  const [contacts, companies, deals, people, pipelines, stages] = await Promise.all([
    allRows((from, to) => crmDb.from('contacts').select('id,first_name,last_name,company_id').eq('org_id', orgId).order('id').range(from, to)),
    allRows((from, to) => crmDb.from('companies').select('id,name').eq('org_id', orgId).order('id').range(from, to)),
    allRows((from, to) => crmDb.from('deals').select('*').eq('org_id', orgId).order('id').range(from, to)),
    allRows((from, to) => crmDb.from('profiles').select('id,name').eq('org_id', orgId).order('id').range(from, to)),
    allRows((from, to) => crmDb.from('pipelines').select('*').eq('org_id', orgId).order('id').range(from, to)),
    allRows((from, to) => crmDb.from('pipeline_stages').select('*').eq('org_id', orgId).order('id').range(from, to)),
  ]);
  return { contacts, companies, deals, people, pipelines, stages };
}
export type OperationReferences = Awaited<ReturnType<typeof loadOperationReferences>>;
