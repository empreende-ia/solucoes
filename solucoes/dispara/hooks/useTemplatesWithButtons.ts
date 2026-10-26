'use client'

import { useQuery } from '@tanstack/react-query'
import type { Template } from '@/types'

export interface TemplateWithButtons {
  name: string
  buttons: string[]
}

interface UseTemplatesWithButtonsOptions {
  // Na PWA de atendente: só busca depois que a sessão foi validada (senão toma 401)
  enabled?: boolean
}

// Lê templates locais (sem chamar Meta API) e devolve só os APPROVED com QUICK_REPLY.
// Usado pelos filtros do inbox (dropdown + pills) — leve, pode reusar cache.
// Precisa ser ?source=local: é o único modo do GET /api/templates liberado para atendente.
export function useTemplatesWithButtons(options: UseTemplatesWithButtonsOptions = {}) {
  const { enabled = true } = options
  const query = useQuery({
    queryKey: ['inbox-templates-with-buttons'],
    queryFn: async (): Promise<TemplateWithButtons[]> => {
      const res = await fetch('/api/templates?source=local', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Falha ao carregar templates')
      const all = (await res.json()) as Template[]
      const withButtons: TemplateWithButtons[] = []
      for (const tpl of all) {
        if (tpl.status !== 'APPROVED') continue
        const buttons: string[] = []
        for (const c of tpl.components || []) {
          if (c.type !== 'BUTTONS' || !c.buttons) continue
          for (const b of c.buttons) {
            if (b.type === 'QUICK_REPLY' && b.text) buttons.push(b.text)
          }
        }
        if (buttons.length > 0) withButtons.push({ name: tpl.name, buttons })
      }
      // Ordenação alfabética.
      withButtons.sort((a, b) => a.name.localeCompare(b.name))
      return withButtons
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  return {
    templates: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
  }
}
