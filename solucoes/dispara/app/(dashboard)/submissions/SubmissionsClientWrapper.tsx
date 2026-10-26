'use client'

import { useSubmissionsController } from '@/hooks/useSubmissions'
import { SubmissionsView } from '@/components/features/submissions/SubmissionsView'
import type { SubmissionsInitialData } from './actions'

interface SubmissionsClientWrapperProps {
  initialData: SubmissionsInitialData | null
  campaignId?: string
  flowId?: string
}

export function SubmissionsClientWrapper({
  initialData,
  campaignId,
  flowId,
}: SubmissionsClientWrapperProps) {
  const controller = useSubmissionsController({
    campaignId,
    flowId,
    initialData: initialData ?? undefined,
  })

  // Ajusta título/descrição baseado nos filtros
  const title = campaignId
    ? 'Submissões da Campanha'
    : flowId
      ? 'Submissões do Flow'
      : 'Todas as Submissões'

  const description = campaignId || flowId
    ? 'Respostas filtradas por campanha ou flow'
    : 'Todas as respostas dos formulários MiniApp'

  return (
    <SubmissionsView
      controller={controller}
      title={title}
      description={description}
      campaignId={campaignId}
      flowId={flowId}
    />
  )
}
