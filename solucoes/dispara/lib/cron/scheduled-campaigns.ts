import 'server-only'
import { supabase } from '@/lib/supabase'
import { CampaignStatus } from '@/types'
import { internalAuthHeaders, resolveBaseUrl } from '@/lib/self-invoke'

/**
 * Fase C (migração QStash→pg_cron) — dispara campanhas agendadas vencidas.
 *
 * Substitui o job one-shot que o QStash enfileirava na criação da campanha. O relógio
 * (pg_cron → /api/cron/tick) varre campanhas SCHEDULED cujo scheduled_date já venceu,
 * faz um claim atômico por linha (UPDATE ... WHERE status='Agendado' → 'Enviando': só
 * um tick ganha cada campanha) e chama /api/campaign/dispatch com trigger:'manual'
 * (o claim já cumpriu o papel do guard isStillScheduled).
 *
 * A chamada leva `Authorization: Bearer <segredo interno>` (internalAuthHeaders):
 * /api/campaign/dispatch tem política `session_or_cron`. Sem o header ela levava 401
 * SEMPRE e a campanha saía degradada pelo sweeper (sem snapshot, perdendo a variante B).
 *
 * Nota: aqui só muda QUANDO a campanha dispara. COMO ela dispara (o motor de disparo em
 * massa) ainda usa o caminho atual — isso é reescrito na Fase F.
 */

const MAX_PER_TICK = 20

export async function drainScheduledCampaigns(): Promise<{
  due: number
  dispatched: number
  errors: number
}> {
  const nowIso = new Date().toISOString()

  // Candidatas vencidas (limitadas por tick; o resto sai no próximo tick).
  const { data: due, error } = await supabase
    .from('campaigns')
    .select('id, template_name')
    .eq('status', CampaignStatus.SCHEDULED)
    .lte('scheduled_date', nowIso)
    .order('scheduled_date', { ascending: true })
    .limit(MAX_PER_TICK)

  if (error) throw error
  const rows = due || []
  if (rows.length === 0) return { due: 0, dispatched: 0, errors: 0 }

  const baseUrl = resolveBaseUrl()
  let dispatched = 0
  let errors = 0

  for (const c of rows) {
    // Claim atômico por linha: o WHERE status='Agendado' é o CAS anti-duplo-disparo.
    const { data: won, error: claimErr } = await supabase
      .from('campaigns')
      .update({ status: CampaignStatus.SENDING })
      .eq('id', c.id)
      .eq('status', CampaignStatus.SCHEDULED)
      .select('id')
      .maybeSingle()

    if (claimErr || !won) continue // outro tick já ganhou esta campanha

    try {
      const resp = await fetch(`${baseUrl}/api/campaign/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
        body: JSON.stringify({
          campaignId: c.id,
          templateName: (c as { template_name?: string }).template_name,
          trigger: 'manual',
        }),
      })
      if (resp.ok) dispatched++
      else {
        errors++
        console.error(`[scheduled-campaigns] dispatch de ${c.id} respondeu ${resp.status}; o sweeper religará a campanha.`)
      }
    } catch {
      errors++
    }
  }

  return { due: rows.length, dispatched, errors }
}
