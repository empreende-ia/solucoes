import 'server-only'
import { supabase } from '@/lib/supabase'
import { CampaignStatus } from '@/types'
import { reinvokeSelf } from '@/lib/self-invoke'

/**
 * Fase F (migração QStash→pg_cron) — sweeper/reaper do disparo em massa.
 *
 * Substitui o retry encadeado do QStash Workflow. O relógio (pg_cron → /api/cron/tick):
 *   (1) reseta linhas campaign_contacts 'sending' órfãs (lease vencido) via RPC
 *       reap_stuck_campaign_sending: enviadas-mas-não-marcadas viram 'sent'; poison vira
 *       'failed'; o resto volta pra 'pending';
 *   (2) re-dispara o drenador (/api/campaign/workflow) das campanhas SENDING cujo lock de
 *       dispatch está livre — ou seja, nenhum drenador ativo. Isso religa a cadeia quando a
 *       chamada fire-and-forget do dispatch/reinvocação se perdeu OU quando um drenador morreu
 *       no meio. O lock (CAS em try_lock_campaign_dispatch) garante que só 1 drenador rode por
 *       campanha, então re-disparar uma campanha já ativa é inócuo (o POST retorna "locked").
 *
 * Uma campanha SENDING com 0 pending também é re-disparada de propósito: o drenador claima 0 e
 * roda o complete (idempotente), fechando a lacuna "SENDING travado sem pending" (drenador que
 * morreu logo antes do complete).
 */

const MAX_PER_TICK = 20

export async function drainStuckCampaigns(): Promise<{
  reaped: number
  candidates: number
  retriggered: number
}> {
  const nowIso = new Date().toISOString()

  // (1) Reaper de 'sending' órfão (lease vencido). Best-effort.
  let reaped = 0
  try {
    const { data, error } = await supabase.rpc('reap_stuck_campaign_sending', {
      p_older_minutes: 10,
      p_max_attempts: 5,
    })
    if (error) throw error
    reaped = typeof data === 'number' ? data : 0
  } catch (e) {
    console.warn('[sweeper] reap_stuck_campaign_sending falhou (best-effort):', e)
  }

  // (2) Campanhas SENDING sem drenador ativo (lock livre/vencido).
  const { data: candidates, error } = await supabase
    .from('campaigns')
    .select('id, dispatch_lock_until')
    .eq('status', CampaignStatus.SENDING)
    .or(`dispatch_lock_until.is.null,dispatch_lock_until.lt.${nowIso}`)
    .limit(MAX_PER_TICK)

  if (error) {
    console.warn('[sweeper] Falha ao buscar campanhas SENDING (best-effort):', error)
    return { reaped, candidates: 0, retriggered: 0 }
  }

  const rows = candidates || []
  let retriggered = 0
  for (const c of rows) {
    // fire-and-forget autenticado; o lock CAS deduplica contra o drenador próprio.
    reinvokeSelf('/api/campaign/workflow', { campaignId: (c as { id: string }).id })
    retriggered++
  }

  return { reaped, candidates: rows.length, retriggered }
}
