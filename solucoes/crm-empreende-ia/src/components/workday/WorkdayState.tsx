import { AlertCircle } from 'lucide-react';
import { LoadingState } from '@/components/foundation/LoadingState';
import { EmptyState } from '@/components/foundation/EmptyState';
import { Button } from '@/components/ds/button';
export function WorkdayState({ loading, orgId, error, retry }: { loading: boolean; orgId: string | null; error: boolean; retry: () => void }) {
  if (loading) return <LoadingState label="Carregando sua rotina…" />;
  if (!orgId) return <EmptyState icon={AlertCircle} title="Organização indisponível" description="Seu usuário precisa estar vinculado a uma organização para consultar esta rotina." />;
  if (error) return <EmptyState icon={AlertCircle} title="Não foi possível carregar a rotina" description="Verifique sua conexão ou solicite uma revisão de acesso ao administrador. Os filtros atuais foram mantidos." action={<Button variant="outline" onClick={retry}>Tentar novamente</Button>} />;
  return null;
}
