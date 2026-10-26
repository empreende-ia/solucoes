'use server'

import { cache } from 'react'
import { createClient } from '@/lib/supabase-server'
import { hasOwnerPrincipal } from '@/lib/server-principal'
import type { Campaign, CampaignFolder, CampaignTag } from '@/types'
import type { CampaignListResult } from '@/services/campaignService'

const PAGE_SIZE = 20

/**
 * Busca dados iniciais de campanhas no servidor (RSC).
 * Retorna primeira página com folders e tags para filtros.
 * Usa cache() para deduplicação per-request.
 * Sem principal de dono devolve null (o client busca pelas APIs).
 */
export const getCampaignsInitialData = cache(async (): Promise<(CampaignListResult & {
  folders: CampaignFolder[]
  tags: CampaignTag[]
}) | null> => {
  // Defesa em profundidade: sem principal de dono (ex.: modo degradado com banco
  // fora), não consulta o banco — a página renderiza só o shell.
  if (!(await hasOwnerPrincipal())) return null

  const supabase = await createClient()

  // Buscar campanhas (com folder e tags), folders e tags em PARALELO
  // JOIN elimina waterfall - tags vêm junto com campanhas em uma única query
  const [campaignsResult, foldersResult, tagsResult] = await Promise.all([
    // Campanhas com folder E tags (JOIN elimina segundo fetch)
    supabase
      .from('campaigns')
      .select(`
        *,
        folder:campaign_folders(id, name, color),
        tag_assignments:campaign_tag_assignments(
          tag:campaign_tags(id, name, color)
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1),

    // Todas as pastas (para filtros)
    supabase
      .from('campaign_folders')
      .select('*')
      .order('name'),

    // Todas as tags (para filtros)
    supabase
      .from('campaign_tags')
      .select('*')
      .order('name')
  ])

  // Mapear campanhas para formato da aplicação
  const campaigns: Campaign[] = (campaignsResult.data || []).map(c => {
    // Extrair tags do JOIN (tag_assignments contém array de { tag: {...} })
    const tags: CampaignTag[] = (c.tag_assignments || [])
      .map((ta: any) => ta.tag)
      .filter((tag: any) => tag && typeof tag === 'object' && !Array.isArray(tag))

    return {
      id: c.id,
      name: c.name,
      templateName: c.template_name || '',
      status: c.status,
      recipients: c.total_recipients || 0,
      sent: c.sent || 0,
      delivered: c.delivered || 0,
      read: c.read || 0,
      skipped: c.skipped || 0,
      failed: c.failed || 0,
      createdAt: c.created_at,
      startedAt: c.started_at,
      completedAt: c.completed_at,
      scheduledAt: c.scheduled_at,
      lastSentAt: c.last_sent_at,
      folderId: c.folder_id,
      folder: c.folder as CampaignFolder | undefined,
      tags
    }
  })

  return {
    data: campaigns,
    total: campaignsResult.count || 0,
    limit: PAGE_SIZE,
    offset: 0,
    folders: (foldersResult.data || []) as CampaignFolder[],
    tags: (tagsResult.data || []) as CampaignTag[]
  }
})
