'use server'

import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase'
import { hasOwnerPrincipal } from '@/lib/server-principal'

export interface SubmissionsInitialData {
  submissions: any[]
  total: number
  page: number
  limit: number
}

/**
 * Server action para buscar dados iniciais das submissões.
 * Usa cache() para dedupe de requests.
 */
export const getSubmissionsInitialData = cache(
  async (params: { campaignId?: string; flowId?: string }): Promise<SubmissionsInitialData | null> => {
    // Defesa em profundidade: sem principal de dono (ex.: modo degradado com banco
    // fora), não consulta o banco — a página renderiza só o shell.
    if (!(await hasOwnerPrincipal())) return null

    const supabase = getSupabaseAdmin()
    if (!supabase) return null

    const limit = 20
    const offset = 0

    let query = supabase
      .from('flow_submissions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (params.campaignId) {
      query = query.eq('campaign_id', params.campaignId)
    }

    if (params.flowId) {
      query = query.eq('flow_id', params.flowId)
    }

    const { data, count, error } = await query

    if (error) {
      console.error('[getSubmissionsInitialData] Error:', error.message)
      return null
    }

    return {
      submissions: data || [],
      total: count || 0,
      page: 1,
      limit,
    }
  }
)
