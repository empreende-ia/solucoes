import { CrmClientWrapper } from './CrmClientWrapper'

/**
 * CRM Page — kanban de pipelines de oportunidades.
 *
 * Página thin: apenas conecta o wrapper client (hook → view).
 * Dados são buscados no cliente via React Query (pipelines + oportunidades).
 */
export default function CrmPage() {
  return <CrmClientWrapper />
}
