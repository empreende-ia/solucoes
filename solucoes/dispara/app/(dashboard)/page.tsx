import { Suspense } from 'react'
import { getDashboardData } from './actions/dashboard'
import { DashboardSkeleton } from '@/components/features/dashboard/DashboardSkeleton'
import { DashboardClientLoader } from './DashboardClientLoader'

// ISR: revalida a cada 30 segundos
export const revalidate = 30

/**
 * Componente async que busca dados no servidor e passa para o cliente.
 * O React Query no cliente vai usar esses dados como initialData,
 * evitando loading spinner no primeiro render.
 */
async function DashboardWithData() {
  const initialData = await getDashboardData()
  return <DashboardClientLoader initialData={initialData ?? undefined} />
}

/**
 * Dashboard Page - RSC Híbrido
 *
 * Arquitetura:
 * 1. Servidor busca dados (getDashboardData)
 * 2. HTML é enviado com dados já presentes
 * 3. Cliente hidrata com initialData (sem loading spinner)
 * 4. React Query assume e mantém dados atualizados via Realtime
 *
 * Fallback: DashboardSkeleton é exibido durante streaming
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardWithData />
    </Suspense>
  )
}
