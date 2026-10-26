import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest, cronUnauthorizedResponse } from '@/lib/cron-auth'
import { isSupabaseConfigured, getSupabaseAdmin } from '@/lib/supabase'
import { reconcilePendingStatusEvents } from '@/lib/whatsapp-status-events'
import { drainScheduledCampaigns } from '@/lib/cron/scheduled-campaigns'
import { drainWorkflowEnrollments } from '@/lib/cron/workflow-enrollments'
import { drainStuckCampaigns } from '@/lib/cron/campaign-drain'

/**
 * Endpoint-relógio do Dispara.
 *
 * Chamado pelo pg_cron do Supabase (via pg_net) a cada minuto — e/ou pela
 * auto-reinvocação dos workers. É o ponto único onde as fases da migração
 * QStash→pg_cron plugam suas varreduras:
 *   - Fase B: reconcile de status de webhook pendentes
 *   - Fase C: disparo de campanhas agendadas vencidas
 *   - Fase D: drain de waits duráveis de fluxo (workflow_enrollments)
 *   - Fase F: sweeper/reaper do disparo em massa
 *
 * FASE A: stub. Só valida a autenticação de cron e responde qual orquestração fará.
 * Nenhuma varredura plugada ainda — não muda comportamento de produção.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handle(request: NextRequest) {
  const auth = verifyCronRequest(request)
  if (!auth.valid) {
    return cronUnauthorizedResponse(auth.error)
  }

  const ran: Array<{ task: string; result: unknown }> = []

  if (isSupabaseConfigured()) {
    // Fase C: dispara campanhas agendadas vencidas (claim atômico + dispatch).
    try {
      const result = await drainScheduledCampaigns()
      ran.push({ task: 'scheduled-campaigns', result })
    } catch (e) {
      ran.push({
        task: 'scheduled-campaigns',
        result: { error: e instanceof Error ? e.message : String(e) },
      })
    }

    // Fase D: drena os waits duráveis de fluxo vencidos (Delay → resume_at).
    try {
      const result = await drainWorkflowEnrollments()
      ran.push({ task: 'workflow-enrollments', result })
    } catch (e) {
      ran.push({
        task: 'workflow-enrollments',
        result: { error: e instanceof Error ? e.message : String(e) },
      })
    }

    // Fase F: sweeper/reaper do disparo em massa — reseta 'sending' órfão e religa
    // campanhas SENDING sem drenador ativo (fire-and-forget perdido ou dreno morto).
    try {
      const result = await drainStuckCampaigns()
      ran.push({ task: 'stuck-campaigns', result })
    } catch (e) {
      ran.push({
        task: 'stuck-campaigns',
        result: { error: e instanceof Error ? e.message : String(e) },
      })
    }

    // Fase B: reconcile de eventos de status de webhook pendentes (unmatched/error).
    // Substitui o retry de 60s que o QStash fazia — best-effort, nunca derruba o tick.
    try {
      const result = await reconcilePendingStatusEvents({ limit: 200 })
      ran.push({ task: 'reconcile-status-events', result })
    } catch (e) {
      ran.push({
        task: 'reconcile-status-events',
        result: { error: e instanceof Error ? e.message : String(e) },
      })
    }

    // Fase E: higiene — remove locks de IA vencidos e dedupes de inbound antigos.
    try {
      const supabase = getSupabaseAdmin()
      if (supabase) {
        const nowIso = new Date().toISOString()
        const weekAgoIso = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toISOString()
        await supabase
          .from('ai_processing_locks')
          .delete()
          .lt('expires_at', nowIso)
        await supabase
          .from('processed_inbound_messages')
          .delete()
          .lt('created_at', weekAgoIso)
      }
    } catch {
      // higiene é best-effort — nunca derruba o tick.
    }
  }

  return NextResponse.json({
    ok: true,
    tick: 'dispara-cron-tick',
    authSource: auth.source,
    ran,
    ts: new Date().toISOString(),
  })
}

export async function POST(request: NextRequest) {
  return handle(request)
}

// GET permite um healthcheck manual autenticado do relógio.
export async function GET(request: NextRequest) {
  return handle(request)
}
