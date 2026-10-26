import { z } from 'zod'

export type ManualDraftTemplate = {
  id: string
  name: string
  language: string
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | string
  status: 'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED' | string
  updatedAt: string
  parameterFormat?: 'positional' | 'named'
  spec?: unknown
  content?: string
}

const DraftRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string().default('pt_BR'),
  category: z.string().default('UTILITY'),
  status: z.string().default('DRAFT'),
  updatedAt: z.string().default(''),
  parameterFormat: z.union([z.literal('positional'), z.literal('named')]).optional(),
  spec: z.unknown().optional(),
  content: z.string().optional(),
})

function parseListResponse(raw: unknown): ManualDraftTemplate[] {
  if (!Array.isArray(raw)) return []
  const parsed: ManualDraftTemplate[] = []
  for (const item of raw) {
    const res = DraftRowSchema.safeParse(item)
    if (!res.success) continue
    parsed.push(res.data)
  }
  return parsed
}

export const manualDraftsService = {
  async get(id: string): Promise<ManualDraftTemplate> {
    const res = await fetch(`/api/templates/drafts/${encodeURIComponent(id)}`, {
      method: 'GET',
      credentials: 'include',
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Falha ao buscar rascunho')
    }
    const data = await res.json()
    const parsed = DraftRowSchema.safeParse(data)
    if (!parsed.success) throw new Error('Resposta inválida ao buscar rascunho')
    return parsed.data
  },

  async list(): Promise<ManualDraftTemplate[]> {
    const res = await fetch('/api/templates/drafts', { method: 'GET', credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Falha ao buscar rascunhos')
    }
    const data = await res.json()
    return parseListResponse(data)
  },

  async create(input: { name: string; language?: string; category?: string; parameterFormat?: 'positional' | 'named' }): Promise<ManualDraftTemplate> {
    const res = await fetch('/api/templates/drafts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Falha ao criar rascunho')
    }
    const data = await res.json()
    const parsed = DraftRowSchema.safeParse(data)
    if (!parsed.success) throw new Error('Resposta inválida ao criar rascunho')
    return parsed.data
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/templates/drafts/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Falha ao excluir rascunho')
    }
  },

  async update(
    id: string,
    patch: { name?: string; language?: string; category?: string; parameterFormat?: 'positional' | 'named'; spec?: unknown }
  ): Promise<ManualDraftTemplate> {
    const res = await fetch(`/api/templates/drafts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Falha ao atualizar rascunho')
    }
    const data = await res.json()
    const parsed = DraftRowSchema.safeParse(data)
    if (!parsed.success) throw new Error('Resposta inválida ao atualizar rascunho')
    return parsed.data
  },

  async submit(id: string): Promise<{ success: boolean; status?: string; id?: string; name?: string }> {
    const res = await fetch(`/api/templates/drafts/${encodeURIComponent(id)}/submit`, { method: 'POST', credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Falha ao enviar template para a Meta')
    }
    return await res.json()
  },

  async clone(templateName: string): Promise<{ id: string; name: string; originalName: string }> {
    const res = await fetch(`/api/templates/${encodeURIComponent(templateName)}/clone`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Falha ao clonar template')
    }
    return await res.json()
  },
}
