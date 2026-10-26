/**
 * Cancel Campaign API
 *
 * POST /api/campaign/[id]/cancel
 *
 * Cancels an in-progress campaign (terminal status).
 * - Marks campaign as CANCELLED and sets cancelled_at
 * - Best-effort: marks pending campaign_contacts as skipped (skip_code=cancelled)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { campaignDb } from '@/lib/supabase-db'
import { CampaignStatus } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  try {
    const { data: row, error } = await supabase
      .from('campaigns')
      .select('id, status, cancelled_at')
      .eq('id', campaignId)
      .single()

    if (error || !row) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Idempotência: se já está cancelada, apenas retorna.
    if (row.status === CampaignStatus.CANCELLED) {
      const campaign = await campaignDb.getById(campaignId)
      return NextResponse.json({ ok: true, status: 'already_cancelled', campaignId, campaign })
    }

    // Não faz sentido cancelar campanhas já finalizadas.
    if ([CampaignStatus.COMPLETED, CampaignStatus.FAILED].includes(row.status as CampaignStatus)) {
      return NextResponse.json(
        { error: 'Campanha já finalizada; não é possível cancelar', status: row.status },
        { status: 409 }
      )
    }

    // Só permite cancelar quando está em envio (ou pausada).
    if (![CampaignStatus.SENDING, CampaignStatus.PAUSED].includes(row.status as CampaignStatus)) {
      return NextResponse.json(
        { error: 'Só é possível cancelar campanhas em envio (ou pausadas)', status: row.status },
        { status: 409 }
      )
    }

    const nowIso = new Date().toISOString()

    // 1) Marca campanha como CANCELLED
    await campaignDb.updateStatus(campaignId, {
      status: CampaignStatus.CANCELLED,
      cancelledAt: nowIso,
      // Defesa: caso a campanha tenha sido iniciada a partir de um agendamento.
      scheduledAt: null,
    })

    // 2) Best-effort: marca pendentes como SKIPPED (para evitar que fiquem eternamente pending)
    try {
      const { count: pendingCount } = await supabase
        .from('campaign_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')

      if ((pendingCount || 0) > 0) {
        await supabase
          .from('campaign_contacts')
          .update({
            status: 'skipped',
            skipped_at: nowIso,
            skip_code: 'cancelled',
            skip_reason: 'Envio cancelado pelo usuário',
            error: null,
            message_id: null,
          })
          .eq('campaign_id', campaignId)
          .eq('status', 'pending')
      }
    } catch (e) {
      console.warn('[CancelCampaign] Failed to mark pending contacts as skipped (best-effort):', e)
    }

    const campaign = await campaignDb.getById(campaignId)

    console.log(`🛑 Campaign ${campaignId} cancelled.`)

    return NextResponse.json({ ok: true, status: 'cancelled', campaignId, campaign })
  } catch (error) {
    console.error('Error cancelling campaign:', error)
    return NextResponse.json(
      { error: 'Failed to cancel campaign', details: (error as Error).message },
      { status: 500 }
    )
  }
}
