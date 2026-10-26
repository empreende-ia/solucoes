import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { manualDraftsService, ManualDraftTemplate } from '@/services/manualDraftsService'

function normalizeTemplateName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export const useManualDraftsController = () => {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')

  const draftsQuery = useQuery({
    queryKey: ['templates', 'drafts', 'manual'],
    queryFn: manualDraftsService.list,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const createMutation = useMutation({
    mutationFn: manualDraftsService.create,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      toast.success(`Rascunho "${created.name}" criado!`)
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao criar rascunho'),
  })

  const deleteMutation = useMutation({
    mutationFn: manualDraftsService.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      toast.success('Rascunho excluído')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao excluir rascunho'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; language?: string; category?: string; parameterFormat?: 'positional' | 'named'; spec?: unknown } }) =>
      manualDraftsService.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      toast.success('Rascunho atualizado')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao atualizar rascunho'),
  })

  const submitMutation = useMutation({
    mutationFn: manualDraftsService.submit,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(`Enviado para a Meta (${res.status || 'PENDING'})`) 
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao enviar para a Meta'),
  })

  const drafts = useMemo(() => {
    const data = draftsQuery.data || []
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter(d => d.name.toLowerCase().includes(q))
  }, [draftsQuery.data, search])

  return {
    drafts,
    isLoading: draftsQuery.isLoading,
    isRefreshing: draftsQuery.isFetching,
    refresh: () => draftsQuery.refetch(),

    search,
    setSearch,

    normalizeTemplateName,

    createDraft: (input: { name: string; language?: string; category?: string; parameterFormat?: 'positional' | 'named' }) =>
      createMutation.mutateAsync({
        ...input,
        name: normalizeTemplateName(input.name),
      }),
    isCreating: createMutation.isPending,

    deleteDraft: (id: string) => deleteMutation.mutate(id),
    isDeleting: deleteMutation.isPending,

    updateDraft: (id: string, patch: { name?: string; language?: string; category?: string; parameterFormat?: 'positional' | 'named'; spec?: unknown }) =>
      updateMutation.mutate({ id, patch }),
    isUpdating: updateMutation.isPending,

    submitDraft: (id: string) => submitMutation.mutate(id),
    isSubmitting: submitMutation.isPending,
  }
}

export type { ManualDraftTemplate }
