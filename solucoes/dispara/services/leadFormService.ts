import type { CreateLeadFormDTO, LeadForm, UpdateLeadFormDTO } from '../types'

/**
 * Lead Form Service
 * CRUD via API routes do Next.js
 */
export const leadFormService = {
  getAll: async (): Promise<LeadForm[]> => {
    const response = await fetch('/api/lead-forms', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error('Falha ao buscar formulários')
    }
    return response.json()
  },

  create: async (dto: CreateLeadFormDTO): Promise<LeadForm> => {
    const response = await fetch('/api/lead-forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Falha ao criar formulário')
    }

    return payload
  },

  update: async (id: string, dto: UpdateLeadFormDTO): Promise<LeadForm> => {
    const response = await fetch(`/api/lead-forms/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Falha ao atualizar formulário')
    }

    return payload
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/lead-forms/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Falha ao deletar formulário')
    }
  },
}
