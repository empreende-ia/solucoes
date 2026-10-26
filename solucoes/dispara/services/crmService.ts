/**
 * CRM Service
 * Camada de acesso à API do CRM (pipelines > etapas > oportunidades).
 * Segue o padrão fetch wrapper tipado dos demais services.
 */

export type OpportunityStatus = 'open' | 'won' | 'lost' | 'abandoned'

export interface PipelineStage {
  id: string
  pipelineId: string
  name: string
  position: number
}

export interface Pipeline {
  id: string
  name: string
  position: number
  stages: PipelineStage[]
  createdAt: string
}

export interface Opportunity {
  id: string
  pipelineId: string
  stageId: string
  contactId: string | null
  phone: string | null
  name: string
  status: OpportunityStatus
  value: number | null
  source: string | null
  stageChangedAt: string
  createdAt: string
  updatedAt?: string | null
  /** dados do contato vinculado (join opcional) */
  contactName?: string | null
  contactPhone?: string | null
}

export interface CreateOpportunityInput {
  pipelineId: string
  stageId: string
  name: string
  contactId?: string | null
  phone?: string | null
  value?: number | null
  status?: OpportunityStatus
}

export interface UpdateOpportunityInput {
  stageId?: string
  status?: OpportunityStatus
  name?: string
  value?: number | null
}

/** Resultado enxuto da busca de contatos (para o modal de nova oportunidade) */
export interface ContactSearchResult {
  id: string
  name: string
  phone: string
}

/** Extrai a mensagem de erro do corpo da resposta, com fallback */
async function parseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  return new Error((body as { error?: string })?.error || fallback)
}

export const crmService = {
  // ==========================================================================
  // Pipelines
  // ==========================================================================

  getPipelines: async (): Promise<Pipeline[]> => {
    const response = await fetch('/api/pipelines', { cache: 'no-store' })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao buscar pipelines')
    }
    return response.json()
  },

  createPipeline: async (input: { name: string; stageNames?: string[] }): Promise<Pipeline> => {
    const response = await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao criar pipeline')
    }
    return response.json()
  },

  renamePipeline: async (id: string, name: string): Promise<void> => {
    const response = await fetch(`/api/pipelines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao renomear pipeline')
    }
  },

  deletePipeline: async (id: string): Promise<void> => {
    const response = await fetch(`/api/pipelines/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao excluir pipeline')
    }
  },

  // ==========================================================================
  // Etapas
  // ==========================================================================

  addStage: async (pipelineId: string, name: string): Promise<PipelineStage> => {
    const response = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao adicionar etapa')
    }
    return response.json()
  },

  renameStage: async (pipelineId: string, stageId: string, name: string): Promise<void> => {
    const response = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, name }),
    })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao renomear etapa')
    }
  },

  deleteStage: async (pipelineId: string, stageId: string): Promise<void> => {
    const response = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId }),
    })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao excluir etapa')
    }
  },

  // ==========================================================================
  // Oportunidades
  // ==========================================================================

  getOpportunities: async (pipelineId: string): Promise<Opportunity[]> => {
    const response = await fetch(
      `/api/opportunities?pipelineId=${encodeURIComponent(pipelineId)}`,
      { cache: 'no-store' }
    )
    if (!response.ok) {
      throw await parseError(response, 'Falha ao buscar oportunidades')
    }
    return response.json()
  },

  createOpportunity: async (input: CreateOpportunityInput): Promise<Opportunity> => {
    const response = await fetch('/api/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao criar oportunidade')
    }
    return response.json()
  },

  updateOpportunity: async (id: string, data: UpdateOpportunityInput): Promise<Opportunity> => {
    const response = await fetch(`/api/opportunities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao atualizar oportunidade')
    }
    return response.json()
  },

  deleteOpportunity: async (id: string): Promise<void> => {
    const response = await fetch(`/api/opportunities/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao excluir oportunidade')
    }
  },

  // ==========================================================================
  // Busca de contatos (modal de nova oportunidade)
  // ==========================================================================

  searchContacts: async (term: string): Promise<ContactSearchResult[]> => {
    const params = new URLSearchParams({ search: term, limit: '10', offset: '0' })
    const response = await fetch(`/api/contacts?${params.toString()}`, { cache: 'no-store' })
    if (!response.ok) {
      throw await parseError(response, 'Falha ao buscar contatos')
    }
    const result = (await response.json()) as {
      data?: Array<{ id: string; name?: string; phone: string }>
    }
    return (result.data ?? []).map((c) => ({
      id: c.id,
      name: c.name || '',
      phone: c.phone,
    }))
  },
}
