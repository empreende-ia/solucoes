'use client'

import { useCrmController } from '@/hooks/useCrm'
import { CrmView } from '@/components/features/crm/CrmView'

/** Wrapper client: conecta o controller do CRM à view (padrão thin-page). */
export function CrmClientWrapper() {
  const controller = useCrmController()
  return <CrmView controller={controller} />
}
