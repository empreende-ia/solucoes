import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { campaignDb } from '@/lib/supabase-db'

export const dynamic = 'force-dynamic'

function noStoreJson(payload: unknown, init?: { status?: number }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}

function safeNumber(x: any): number | null {
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}

function computeDispatchMetrics(firstDispatchAt?: string | null, lastSentAt?: string | null, sentTotal?: number | null) {
  if (!firstDispatchAt || !lastSentAt) return { dispatchDurationMs: null, throughputMps: null }
  const start = Date.parse(firstDispatchAt)
  const end = Date.parse(lastSentAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { dispatchDurationMs: null, throughputMps: null }

  const dispatchDurationMs = Math.max(0, end - start)
  const sent = typeof sentTotal === 'number' ? sentTotal : null
  const throughputMps = dispatchDurationMs > 0 && sent !== null ? (sent / (dispatchDurationMs / 1000)) : null

  return { dispatchDurationMs, throughputMps }
}

function isMissingTableError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase()
  // Supabase/Postgres costuma retornar "does not exist" quando a relation/tabela não existe.
  return msg.includes('does not exist') || msg.includes('relation') && msg.includes('does not exist')
}

/**
 * Query A/B variant-grouped metrics from campaign_contacts.
 * Returns null when the campaign has no A/B test or query fails.
 */
async function queryVariantMetrics(campaignId: string) {
  try {
    // Check if campaign has A/B testing enabled
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('ab_test_enabled, template_name, ab_template_name_b')
      .eq('id', campaignId)
      .single()

    if (!campaignData?.ab_test_enabled) return null

    // Query counts grouped by variant + status
    const { data: rows, error } = await supabase
      .rpc('get_ab_variant_metrics', { p_campaign_id: campaignId })

    // Fallback: if RPC doesn't exist, do manual query
    if (error) {
      // Manual aggregation: query all contacts and group in JS
      const { data: contacts, error: contactErr } = await supabase
        .from('campaign_contacts')
        .select('variant, status')
        .eq('campaign_id', campaignId)

      if (contactErr || !contacts) return null

      const variants: Record<string, { templateName: string; sent: number; delivered: number; read: number; failed: number; skipped: number; total: number }> = {}

      for (const c of contacts) {
        const v = (c as any).variant || 'A'
        if (!variants[v]) {
          variants[v] = {
            templateName: v === 'B' ? (campaignData.ab_template_name_b || '') : (campaignData.template_name || ''),
            sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, total: 0,
          }
        }
        variants[v].total++
        const st = String((c as any).status || '').toLowerCase()
        if (st === 'sent') variants[v].sent++
        else if (st === 'delivered') variants[v].delivered++
        else if (st === 'read') variants[v].read++
        else if (st === 'failed') variants[v].failed++
        else if (st === 'skipped') variants[v].skipped++
      }

      return { variants }
    }

    // Process RPC result
    const variants: Record<string, any> = {}
    for (const row of (rows || []) as any[]) {
      const v = row.variant || 'A'
      if (!variants[v]) {
        variants[v] = {
          templateName: v === 'B' ? (campaignData.ab_template_name_b || '') : (campaignData.template_name || ''),
          sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, total: 0,
        }
      }
      variants[v][row.status] = (variants[v][row.status] || 0) + Number(row.count || 0)
      variants[v].total += Number(row.count || 0)
    }

    return { variants }
  } catch {
    return null
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return noStoreJson({ error: 'Missing campaign id' }, { status: 400 })

  // A/B variant metrics (best-effort, added to all responses)
  const abVariants = await queryVariantMetrics(id)

  // 1) Prefer métricas persistidas (run/batch) quando existir
  try {
    // Executar queries em paralelo para reduzir latência
    const [runResult, baselineResult] = await Promise.all([
      supabase
        .from('campaign_run_metrics')
        .select('*')
        .eq('campaign_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('campaign_run_metrics')
        .select('campaign_id, created_at, template_name, recipients, sent_total, failed_total, skipped_total, dispatch_duration_ms, throughput_mps, meta_avg_ms, db_avg_ms, saw_throughput_429, config_hash, config')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    const { data: run, error: runErr } = runResult
    const { data: baseline, error: baselineErr } = baselineResult

    const runTableMissing = !!runErr && isMissingTableError(runErr)
    const runHadError = !!runErr && !runTableMissing

    if (runHadError) {
      // Erros não-esperados
      console.warn('[metrics] run query error', runErr)
    }

    const baselineTableMissing = !!baselineErr && isMissingTableError(baselineErr)
    const baselineHadError = !!baselineErr && !baselineTableMissing

    if (baselineHadError) {
      console.warn('[metrics] baseline query error', baselineErr)
    }

    const tableMissing = runTableMissing || baselineTableMissing
    const tableExists = !tableMissing

    if (run) {
      return noStoreJson({
        current: run,
        baseline: baseline || [],
        source: 'run_metrics',
        ...(abVariants ? { abVariants: abVariants.variants } : {}),
      })
    }

    // Se a tabela existe mas ainda não há run para esta campanha, não faz sentido
    // dizer para "aplicar a migration". Retornamos a fonte como run_metrics e
    // usamos o campaigns apenas para preencher o CURRENT de forma sent-only.
    if (tableExists && !run) {
      const campaign = await campaignDb.getById(id)
      if (!campaign) return noStoreJson({ error: 'Campaign not found' }, { status: 404 })

      const firstDispatchAt = (campaign as any).firstDispatchAt ?? null
      const lastSentAt = (campaign as any).lastSentAt ?? null
      const sentTotal = safeNumber((campaign as any).sent)
      const { dispatchDurationMs, throughputMps } = computeDispatchMetrics(firstDispatchAt, lastSentAt, sentTotal)

      const hint = (runHadError || baselineHadError)
        ? 'A tabela de métricas existe, mas houve erro ao consultar run_metrics. Verifique logs do /api/campaign/workflow e permissões/credenciais do Supabase (SUPABASE_SECRET_KEY).'
        : 'A tabela de métricas existe, mas ainda não há uma execução (run_metrics) registrada para esta campanha. Rode uma nova campanha (após o deploy dessas mudanças) para gerar trace_id + métricas por execução.'

      return noStoreJson({
        current: {
          campaign_id: (campaign as any).id,
          template_name: (campaign as any).templateName ?? null,
          recipients: (campaign as any).recipients ?? null,
          sent_total: (campaign as any).sent ?? null,
          failed_total: (campaign as any).failed ?? null,
          skipped_total: (campaign as any).skipped ?? null,
          first_dispatch_at: firstDispatchAt,
          last_sent_at: lastSentAt,
          dispatch_duration_ms: dispatchDurationMs,
          throughput_mps: throughputMps,
          meta_avg_ms: null,
          db_avg_ms: null,
          saw_throughput_429: null,
          config: null,
          config_hash: null,
        },
        baseline: baseline || [],
        source: 'run_metrics',
        hint,
        ...(abVariants ? { abVariants: abVariants.variants } : {}),
      })
    }

    // Se não houver run ainda, cai para fallback abaixo.
  } catch {
    // best-effort fallback
  }

  // 2) Fallback: calcula somente com base na tabela campaigns (sem meta/db avg)
  const campaign = await campaignDb.getById(id)
  if (!campaign) return noStoreJson({ error: 'Campaign not found' }, { status: 404 })

  const firstDispatchAt = (campaign as any).firstDispatchAt ?? null
  const lastSentAt = (campaign as any).lastSentAt ?? null
  const sentTotal = safeNumber((campaign as any).sent)

  const { dispatchDurationMs, throughputMps } = computeDispatchMetrics(firstDispatchAt, lastSentAt, sentTotal)

  // Baseline simples: últimas campanhas (sent-only) — útil mesmo antes da migração existir.
  let baselineFallback: any[] = []
  try {
    const { data } = await supabase
      .from('campaigns')
      .select('id, created_at, template_name, total_recipients, sent, failed, skipped, first_dispatch_at, last_sent_at')
      .order('created_at', { ascending: false })
      .limit(20)

    baselineFallback = (data || []).map((row: any) => {
      const { dispatchDurationMs, throughputMps } = computeDispatchMetrics(row.first_dispatch_at, row.last_sent_at, safeNumber(row.sent))
      return {
        campaign_id: row.id,
        created_at: row.created_at,
        template_name: row.template_name,
        recipients: row.total_recipients,
        sent_total: safeNumber(row.sent),
        failed_total: safeNumber(row.failed),
        skipped_total: safeNumber(row.skipped),
        dispatch_duration_ms: dispatchDurationMs,
        throughput_mps: throughputMps,
        meta_avg_ms: null,
        db_avg_ms: null,
        saw_throughput_429: null,
        config_hash: null,
        config: null,
      }
    })
  } catch {
    // ignore
  }

  return noStoreJson({
    current: {
      campaign_id: (campaign as any).id,
      template_name: (campaign as any).templateName ?? null,
      recipients: (campaign as any).recipients ?? null,
      sent_total: (campaign as any).sent ?? null,
      failed_total: (campaign as any).failed ?? null,
      skipped_total: (campaign as any).skipped ?? null,
      first_dispatch_at: firstDispatchAt,
      last_sent_at: lastSentAt,
      dispatch_duration_ms: dispatchDurationMs,
      throughput_mps: throughputMps,
      meta_avg_ms: null,
      db_avg_ms: null,
      saw_throughput_429: null,
      config: null,
      config_hash: null,
    },
    baseline: baselineFallback,
    source: 'campaigns_fallback',
    hint: 'Métricas avançadas (run/batch) ainda não estão disponíveis. Aplique a migration 0008_add_campaign_performance_metrics.sql no Supabase e execute uma nova campanha para gerar o baseline por execução.',
    ...(abVariants ? { abVariants: abVariants.variants } : {}),
  })
}
