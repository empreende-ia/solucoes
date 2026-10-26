import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { flowsService } from '@/services/flowsService'

export const useFlowsBuilderController = () => {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const flowsQuery = useQuery({
    queryKey: ['flows'],
    queryFn: flowsService.list,
    staleTime: 10_000,
  })

  const createMutation = useMutation({
    mutationFn: flowsService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] })
      toast.success('MiniApp criado')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao criar MiniApp'),
  })

  const createFromTemplateMutation = useMutation({
    mutationFn: flowsService.createFromTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] })
      toast.success('MiniApp criado a partir do template')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao criar MiniApp'),
  })

  const createWithAIMutation = useMutation({
    mutationFn: async (input: { name: string; prompt: string }) => {
      const res = await fetch('/api/ai/generate-flow-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: input.prompt,
          titleHint: input.name,
          maxQuestions: 10,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = (data?.error && String(data.error)) || 'Falha ao gerar MiniApp com IA'
        const details = data?.details ? `: ${String(data.details)}` : ''
        throw new Error(`${msg}${details}`)
      }

      const issues = Array.isArray(data?.issues) ? (data.issues as string[]) : []
      if (issues.length > 0) {
        throw new Error(`A IA gerou um formulário com ajustes pendentes: ${issues.join(', ')}`)
      }

      const form = data?.form
      const flowJson = data?.flowJson
      if (!form || !flowJson) throw new Error('Resposta inválida da IA (form/flowJson ausentes)')

      const created = await flowsService.create({ name: input.name })

      const baseSpec = created && typeof created.spec === 'object' && created.spec ? created.spec : {}
      const nextSpec = { ...(baseSpec as any), form }

      return await flowsService.update(created.id, {
        spec: nextSpec,
        flowJson,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] })
      toast.success('MiniApp criado com IA')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao criar MiniApp com IA'),
  })

  const deleteMutation = useMutation({
    mutationFn: flowsService.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows'] })
      toast.success('MiniApp excluído')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao excluir MiniApp'),
  })

  const flows = useMemo(() => {
    const rows = flowsQuery.data || []
    const s = search.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((f) => f.name.toLowerCase().includes(s) || String(f.meta_flow_id || '').toLowerCase().includes(s))
  }, [flowsQuery.data, search])

  return {
    flows,
    isLoading: flowsQuery.isLoading,
    isFetching: flowsQuery.isFetching,
    error: flowsQuery.error as Error | null,
    refetch: flowsQuery.refetch,

    search,
    setSearch,

    createFlowAsync: (name: string) => createMutation.mutateAsync({ name }),
    isCreating: createMutation.isPending,

    createFlowFromTemplateAsync: (input: { name: string; templateKey: string }) => createFromTemplateMutation.mutateAsync(input),

    createFlowWithAIAsync: (input: { name: string; prompt: string }) => createWithAIMutation.mutateAsync(input),
    isCreatingWithAI: createWithAIMutation.isPending,

    deleteFlow: (id: string) => deleteMutation.mutate(id),
    isDeleting: deleteMutation.isPending,
  }
}
