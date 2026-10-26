import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { flowsService } from '@/services/flowsService'

export function useFlowEditorController(flowId: string) {
  const qc = useQueryClient()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const flowQuery = useQuery({
    queryKey: ['flows', flowId],
    queryFn: () => flowsService.get(flowId),
    enabled: mounted && !!flowId,
  })

  const updateMutation = useMutation({
    mutationFn: (patch: { name?: string; metaFlowId?: string; resetMeta?: boolean; spec?: unknown; templateKey?: string; flowJson?: unknown; mapping?: unknown }) =>
      flowsService.update(flowId, patch),
    onSuccess: (row) => {
      qc.setQueryData(['flows', flowId], row)
      qc.invalidateQueries({ queryKey: ['flows'] })
      toast.success('MiniApp salva')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar'),
  })

  const publishMutation = useMutation({
    mutationFn: (input?: { publish?: boolean; categories?: string[]; updateIfExists?: boolean }) => flowsService.publishToMeta(flowId, input),
    onSuccess: (row) => {
      qc.setQueryData(['flows', flowId], row)
      qc.invalidateQueries({ queryKey: ['flows'] })
      toast.success('MiniApp publicada na Meta')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao publicar na Meta'),
  })

  const flow = flowQuery.data

  const spec = useMemo(() => {
    const s = (flow as any)?.spec
    if (s && typeof s === 'object') return s
    return {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      form: {
        version: 1,
        screenId: 'FORM',
        title: (flow as any)?.name || 'Formulário',
        intro: 'Preencha os dados abaixo:',
        submitLabel: 'Enviar',
        fields: [],
      },
      nodes: [],
      edges: [],
    }
  }, [flow])

  return {
    flow,
    spec,
    isLoading: !mounted || flowQuery.isLoading,
    isError: flowQuery.isError,
    error: flowQuery.error as Error | null,

    save: (patch: { name?: string; metaFlowId?: string; resetMeta?: boolean; spec?: unknown; templateKey?: string; flowJson?: unknown; mapping?: unknown }) =>
      updateMutation.mutate(patch),
    saveAsync: (patch: { name?: string; metaFlowId?: string; resetMeta?: boolean; spec?: unknown; templateKey?: string; flowJson?: unknown; mapping?: unknown }) =>
      updateMutation.mutateAsync(patch),
    isSaving: updateMutation.isPending,

    publishToMeta: (input?: { publish?: boolean; categories?: string[]; updateIfExists?: boolean }) => publishMutation.mutate(input),
    publishToMetaAsync: (input?: { publish?: boolean; categories?: string[]; updateIfExists?: boolean }) => publishMutation.mutateAsync(input),
    isPublishingToMeta: publishMutation.isPending,
  }
}
