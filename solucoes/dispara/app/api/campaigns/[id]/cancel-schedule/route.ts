import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { campaignDb } from '@/lib/supabase-db'
import { CampaignStatus } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/campaigns/[id]/cancel-schedule
 * Cancela o agendamento de uma campanha e volta para Rascunho.
 *
 * Migração QStash→pg_cron (Fase C): 100% Postgres, sem QStash. O cancelamento é um
 * UPDATE condicional (status='Agendado' → 'Rascunho'). Se o relógio já flipou a
 * campanha para 'Enviando' entre a leitura e o update, o cancel perde a corrida e
 * responde 409 — nunca cancela uma campanha que já começou a disparar.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params

    const { data: row, error } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .single()

    if (error || !row) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    }

    // Claim atômico: só reverte se ainda estiver agendada. O WHERE status='Agendado'
    // é a garantia contra cancelar uma campanha que o cron já iniciou.
    const { data: won, error: updErr } = await supabase
      .from('campaigns')
      .update({
        status: CampaignStatus.DRAFT,
        scheduled_date: null,
        started_at: null,
        completed_at: null,
      })
      .eq('id', id)
      .eq('status', CampaignStatus.SCHEDULED)
      .select('id')
      .maybeSingle()

    if (updErr) throw updErr

    if (!won) {
      return NextResponse.json(
        { error: 'Só é possível cancelar campanhas agendadas', status: row.status },
        { status: 409 }
      )
    }

    const updated = await campaignDb.getById(id)
    return NextResponse.json({ ok: true, campaign: updated })
  } catch (error) {
    console.error('Failed to cancel schedule:', error)
    return NextResponse.json(
      { error: 'Falha ao cancelar agendamento', details: (error as Error).message },
      { status: 500 }
    )
  }
}
