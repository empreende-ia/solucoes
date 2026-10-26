import { NextResponse } from 'next/server'
import { campaignDb, campaignFolderDb, campaignTagDb } from '@/lib/supabase-db'
import { supabase } from '@/lib/supabase'

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * GET /api/campaigns/[id]
 * Get a single campaign with folder and tags
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const campaign = await campaignDb.getById(id)

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campanha não encontrada' },
        { status: 404 }
      )
    }

    // Se a campanha tem Flow, buscar contagem de submissões
    let submissionsCount = 0
    if (campaign.flowId) {
      const { count, error } = await supabase
        .from('flow_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', id)

      if (!error && count !== null) {
        submissionsCount = count
      }
    }

    // Buscar folder e tags
    let folder = null
    if (campaign.folderId) {
      folder = await campaignFolderDb.getById(campaign.folderId)
    }
    const tags = await campaignTagDb.getForCampaign(id)

    // No cache for campaign data (needs real-time updates)
    return NextResponse.json(
      { ...campaign, submissionsCount, folder, tags },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    )
  } catch (error) {
    console.error('Failed to fetch campaign:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar campanha', details: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/campaigns/[id]
 * Update a campaign (including folderId and tagIds)
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()

    // Extrair tagIds do body (se presente)
    const { tagIds, ...updateData } = body

    // Atualizar campanha (incluindo folderId se presente)
    const campaign = await campaignDb.updateStatus(id, updateData)

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campanha não encontrada' },
        { status: 404 }
      )
    }

    // Se tagIds foi fornecido, atualizar as tags da campanha
    if (tagIds !== undefined && Array.isArray(tagIds)) {
      await campaignTagDb.assignToCampaign(id, tagIds)
    }

    // Buscar folder e tags atualizadas
    let folder = null
    if (campaign.folderId) {
      folder = await campaignFolderDb.getById(campaign.folderId)
    }
    const tags = await campaignTagDb.getForCampaign(id)

    return NextResponse.json({ ...campaign, folder, tags })
  } catch (error) {
    console.error('Failed to update campaign:', error)
    return NextResponse.json(
      { error: 'Falha ao atualizar campanha', details: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/campaigns/[id]
 * Delete a campaign
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params
    await campaignDb.delete(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete campaign:', error)
    return NextResponse.json(
      { error: 'Falha ao deletar campanha', details: (error as Error).message },
      { status: 500 }
    )
  }
}
