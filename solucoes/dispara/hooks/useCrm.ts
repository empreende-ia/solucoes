'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  crmService,
  type Opportunity,
  type OpportunityStatus,
  type Pipeline,
  type PipelineStage,
  type UpdateOpportunityInput,
} from '@/services/crmService'

// =============================================================================
// Query keys
// =============================================================================

const PIPELINES_KEY = ['pipelines'] as const
const opportunitiesKey = (pipelineId: string) => ['opportunities', pipelineId] as const

// =============================================================================
// Tipos auxiliares do controller
// =============================================================================

export interface StageColumn {
  stage: PipelineStage
  opportunities: Opportunity[]
  /** soma dos valores das oportunidades da etapa */
  totalValue: number
}

export interface NewOpportunityForm {
  stageId: string
  name: string
  contactId: string | null
  phone: string | null
  value: number | null
}

/**
 * Controller do CRM (kanban de pipelines).
 * Padrão: React Query + estado de UI + estado derivado.
 */
export const useCrmController = () => {
  const queryClient = useQueryClient()

  // --- Estado de UI ---
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [isNewPipelineOpen, setIsNewPipelineOpen] = useState(false)
  const [isRenamePipelineOpen, setIsRenamePipelineOpen] = useState(false)
  const [isManageStagesOpen, setIsManageStagesOpen] = useState(false)
  const [isDeletePipelineOpen, setIsDeletePipelineOpen] = useState(false)
  /** etapa alvo do modal "Nova oportunidade" (null = fechado) */
  const [newOpportunityStageId, setNewOpportunityStageId] = useState<string | null>(null)
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null)
  const [deletingOpportunity, setDeletingOpportunity] = useState<Opportunity | null>(null)

  // --- Queries ---
  const pipelinesQuery = useQuery({
    queryKey: PIPELINES_KEY,
    queryFn: crmService.getPipelines,
    staleTime: 30_000,
  })

  const pipelines = useMemo(
    () => [...(pipelinesQuery.data ?? [])].sort((a, b) => a.position - b.position),
    [pipelinesQuery.data]
  )

  // Seleção automática: primeiro pipeline quando nada selecionado ou seleção sumiu
  useEffect(() => {
    if (pipelines.length === 0) {
      if (selectedPipelineId !== null) setSelectedPipelineId(null)
      return
    }
    const stillExists = pipelines.some((p) => p.id === selectedPipelineId)
    if (!selectedPipelineId || !stillExists) {
      setSelectedPipelineId(pipelines[0].id)
    }
  }, [pipelines, selectedPipelineId])

  const selectedPipeline: Pipeline | null = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  )

  const opportunitiesQuery = useQuery({
    queryKey: opportunitiesKey(selectedPipelineId ?? 'none'),
    queryFn: () => crmService.getOpportunities(selectedPipelineId!),
    enabled: !!selectedPipelineId,
    staleTime: 15_000,
  })

  // --- Estado derivado: colunas do kanban ---
  const columns: StageColumn[] = useMemo(() => {
    if (!selectedPipeline) return []
    const stages = [...selectedPipeline.stages].sort((a, b) => a.position - b.position)
    const opportunities = opportunitiesQuery.data ?? []
    return stages.map((stage) => {
      const stageOpps = opportunities.filter((o) => o.stageId === stage.id)
      return {
        stage,
        opportunities: stageOpps,
        totalValue: stageOpps.reduce((sum, o) => sum + (o.value ?? 0), 0),
      }
    })
  }, [selectedPipeline, opportunitiesQuery.data])

  const invalidatePipelines = () => queryClient.invalidateQueries({ queryKey: PIPELINES_KEY })
  const invalidateOpportunities = () => {
    if (selectedPipelineId) {
      queryClient.invalidateQueries({ queryKey: opportunitiesKey(selectedPipelineId) })
    }
  }

  // --- Mutations: pipelines ---
  const createPipelineMutation = useMutation({
    mutationFn: (name: string) => crmService.createPipeline({ name }),
    onSuccess: (pipeline) => {
      invalidatePipelines()
      setSelectedPipelineId(pipeline.id)
      setIsNewPipelineOpen(false)
      toast.success('Pipeline criado com sucesso!')
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao criar pipeline'),
  })

  const renamePipelineMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      crmService.renamePipeline(id, name),
    onSuccess: () => {
      invalidatePipelines()
      setIsRenamePipelineOpen(false)
      toast.success('Pipeline renomeado!')
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao renomear pipeline'),
  })

  const deletePipelineMutation = useMutation({
    mutationFn: (id: string) => crmService.deletePipeline(id),
    onSuccess: () => {
      invalidatePipelines()
      setIsDeletePipelineOpen(false)
      setSelectedPipelineId(null)
      toast.success('Pipeline excluído.')
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao excluir pipeline'),
  })

  // --- Mutations: etapas ---
  const addStageMutation = useMutation({
    mutationFn: ({ pipelineId, name }: { pipelineId: string; name: string }) =>
      crmService.addStage(pipelineId, name),
    onSuccess: () => {
      invalidatePipelines()
      toast.success('Etapa adicionada!')
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao adicionar etapa'),
  })

  const renameStageMutation = useMutation({
    mutationFn: ({ pipelineId, stageId, name }: { pipelineId: string; stageId: string; name: string }) =>
      crmService.renameStage(pipelineId, stageId, name),
    onSuccess: () => {
      invalidatePipelines()
      toast.success('Etapa renomeada!')
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao renomear etapa'),
  })

  const deleteStageMutation = useMutation({
    mutationFn: ({ pipelineId, stageId }: { pipelineId: string; stageId: string }) =>
      crmService.deleteStage(pipelineId, stageId),
    onSuccess: () => {
      invalidatePipelines()
      invalidateOpportunities()
      toast.success('Etapa excluída.')
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao excluir etapa'),
  })

  // --- Mutations: oportunidades ---
  const createOpportunityMutation = useMutation({
    mutationFn: (form: NewOpportunityForm) =>
      crmService.createOpportunity({
        pipelineId: selectedPipelineId!,
        stageId: form.stageId,
        name: form.name,
        contactId: form.contactId,
        phone: form.phone,
        value: form.value,
      }),
    onSuccess: () => {
      invalidateOpportunities()
      setNewOpportunityStageId(null)
      toast.success('Oportunidade criada!')
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao criar oportunidade'),
  })

  const updateOpportunityMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOpportunityInput }) =>
      crmService.updateOpportunity(id, data),
    onSuccess: () => {
      invalidateOpportunities()
      setEditingOpportunity(null)
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao atualizar oportunidade'),
  })

  // Mover de etapa (drag and drop) com update otimista
  const moveOpportunityMutation = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) =>
      crmService.updateOpportunity(id, { stageId }),
    onMutate: async ({ id, stageId }) => {
      if (!selectedPipelineId) return { previous: undefined, pipelineId: null }
      const key = opportunitiesKey(selectedPipelineId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Opportunity[]>(key)
      queryClient.setQueryData<Opportunity[]>(key, (old) =>
        (old ?? []).map((o) =>
          o.id === id ? { ...o, stageId, stageChangedAt: new Date().toISOString() } : o
        )
      )
      return { previous, pipelineId: selectedPipelineId }
    },
    onError: (_error, _variables, context) => {
      if (context?.pipelineId && context.previous) {
        queryClient.setQueryData(opportunitiesKey(context.pipelineId), context.previous)
      }
      toast.error('Erro ao mover oportunidade')
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.pipelineId) {
        queryClient.invalidateQueries({ queryKey: opportunitiesKey(context.pipelineId) })
      }
    },
  })

  const deleteOpportunityMutation = useMutation({
    mutationFn: (id: string) => crmService.deleteOpportunity(id),
    onSuccess: () => {
      invalidateOpportunities()
      setDeletingOpportunity(null)
      toast.success('Oportunidade excluída.')
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao excluir oportunidade'),
  })

  // --- Handlers expostos ---
  const onChangeStatus = (opportunity: Opportunity, status: OpportunityStatus) => {
    updateOpportunityMutation.mutate(
      { id: opportunity.id, data: { status } },
      {
        onSuccess: () => {
          const labels: Record<OpportunityStatus, string> = {
            open: 'Oportunidade reaberta!',
            won: 'Oportunidade marcada como ganha!',
            lost: 'Oportunidade marcada como perdida.',
            abandoned: 'Oportunidade marcada como abandonada.',
          }
          toast.success(labels[status])
        },
      }
    )
  }

  const onSaveEdit = (id: string, data: { name: string; value: number | null }) => {
    updateOpportunityMutation.mutate(
      { id, data },
      { onSuccess: () => toast.success('Oportunidade atualizada!') }
    )
  }

  return {
    // dados
    pipelines,
    selectedPipeline,
    selectedPipelineId,
    columns,
    isLoadingPipelines: pipelinesQuery.isLoading,
    isLoadingOpportunities: opportunitiesQuery.isLoading,

    // seleção de pipeline
    setSelectedPipelineId,

    // modais
    isNewPipelineOpen,
    setIsNewPipelineOpen,
    isRenamePipelineOpen,
    setIsRenamePipelineOpen,
    isManageStagesOpen,
    setIsManageStagesOpen,
    isDeletePipelineOpen,
    setIsDeletePipelineOpen,
    newOpportunityStageId,
    setNewOpportunityStageId,
    editingOpportunity,
    setEditingOpportunity,
    deletingOpportunity,
    setDeletingOpportunity,

    // ações: pipelines
    onCreatePipeline: (name: string) => createPipelineMutation.mutate(name),
    isCreatingPipeline: createPipelineMutation.isPending,
    onRenamePipeline: (name: string) => {
      if (selectedPipelineId) renamePipelineMutation.mutate({ id: selectedPipelineId, name })
    },
    isRenamingPipeline: renamePipelineMutation.isPending,
    onDeletePipeline: () => {
      if (selectedPipelineId) deletePipelineMutation.mutate(selectedPipelineId)
    },
    isDeletingPipeline: deletePipelineMutation.isPending,

    // ações: etapas
    onAddStage: (name: string) => {
      if (selectedPipelineId) addStageMutation.mutate({ pipelineId: selectedPipelineId, name })
    },
    isAddingStage: addStageMutation.isPending,
    onRenameStage: (stageId: string, name: string) => {
      if (selectedPipelineId) {
        renameStageMutation.mutate({ pipelineId: selectedPipelineId, stageId, name })
      }
    },
    isRenamingStage: renameStageMutation.isPending,
    onDeleteStage: (stageId: string) => {
      if (selectedPipelineId) deleteStageMutation.mutate({ pipelineId: selectedPipelineId, stageId })
    },
    isDeletingStage: deleteStageMutation.isPending,

    // ações: oportunidades
    onCreateOpportunity: (form: NewOpportunityForm) => createOpportunityMutation.mutate(form),
    isCreatingOpportunity: createOpportunityMutation.isPending,
    onMoveOpportunity: (id: string, stageId: string) =>
      moveOpportunityMutation.mutate({ id, stageId }),
    onChangeStatus,
    onSaveEdit,
    isSavingOpportunity: updateOpportunityMutation.isPending,
    onConfirmDeleteOpportunity: () => {
      if (deletingOpportunity) deleteOpportunityMutation.mutate(deletingOpportunity.id)
    },
    isDeletingOpportunity: deleteOpportunityMutation.isPending,
  }
}

export type CrmController = ReturnType<typeof useCrmController>

/**
 * Busca de contatos com debounce (modal de nova oportunidade).
 * Mantém a camada Hook → Service: o componente só passa o termo digitado.
 */
export function useContactSearch(term: string) {
  const [debouncedTerm, setDebouncedTerm] = useState(term)

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedTerm(term), 300)
    return () => clearTimeout(timeout)
  }, [term])

  const normalized = debouncedTerm.trim()
  const query = useQuery({
    queryKey: ['crmContactSearch', normalized.toLowerCase()],
    queryFn: () => crmService.searchContacts(normalized),
    enabled: normalized.length >= 2,
    staleTime: 30_000,
  })

  return {
    results: query.data ?? [],
    isSearching: query.isFetching,
    hasSearched: normalized.length >= 2 && !query.isFetching,
  }
}
