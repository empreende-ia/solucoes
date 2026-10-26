import { Suspense } from 'react'
import { getCampaignsInitialData } from './actions'
import { CampaignsClientWrapper } from './CampaignsClientWrapper'
import { CampaignsSkeleton } from '@/components/features/campaigns/CampaignsSkeleton'

// ISR: revalida a cada 60 segundos (campanhas mudam menos que dashboard)
export const revalidate = 60

/**
 * Componente async que busca dados no servidor e passa para o cliente.
 */
async function CampaignsWithData() {
  const initialData = await getCampaignsInitialData()
  return <CampaignsClientWrapper initialData={initialData ?? undefined} />
}

/**
 * Campaigns Page - RSC Híbrido
 *
 * Arquitetura:
 * 1. Servidor busca primeira página + folders + tags
 * 2. HTML é enviado com dados já presentes
 * 3. Cliente hidrata com initialData (sem loading spinner)
 * 4. React Query assume e mantém dados atualizados
 */
export default function CampaignsPage() {
  return (
    <Suspense fallback={<CampaignsSkeleton />}>
      <CampaignsWithData />
    </Suspense>
  )
}
