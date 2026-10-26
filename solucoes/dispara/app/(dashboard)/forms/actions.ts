'use server'

import { createClient } from '@/lib/supabase-server'
import { hasOwnerPrincipal } from '@/lib/server-principal'
import type { LeadForm } from '@/types'

export interface FormsInitialData {
  forms: LeadForm[]
  tags: string[]
  publicBaseUrl: string
}

/**
 * Busca dados iniciais de formulários no servidor (RSC).
 * Sem principal de dono devolve null (o client busca pelas APIs).
 */
export async function getFormsInitialData(): Promise<FormsInitialData | null> {
  // Defesa em profundidade: sem principal de dono (ex.: modo degradado com banco
  // fora), não consulta o banco — a página renderiza só o shell.
  if (!(await hasOwnerPrincipal())) return null

  const supabase = await createClient()

  // Buscar formulários e tags em paralelo
  const [formsResult, tagsResult] = await Promise.all([
    supabase
      .from('lead_forms')
      .select('*')
      .order('created_at', { ascending: false }),

    supabase
      .from('contacts')
      .select('tags')
      .not('tags', 'is', null)
  ])

  // Extrair tags únicas
  const allTags = new Set<string>()
  ;(tagsResult.data || []).forEach(row => {
    if (Array.isArray(row.tags)) {
      row.tags.forEach((tag: string) => allTags.add(tag))
    }
  })

  // URL base para formulários públicos
  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000'

  return {
    forms: (formsResult.data || []) as LeadForm[],
    tags: Array.from(allTags).sort(),
    publicBaseUrl
  }
}
