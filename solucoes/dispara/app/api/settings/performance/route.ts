import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { clampInt } from '@/lib/validation-utils'

export const dynamic = 'force-dynamic'

function noStoreJson(payload: unknown, init?: { status?: number }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

function safeNumber(x: unknown): number | null {
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  const pp = Math.max(0, Math.min(1, p))
  const idx = (sorted.length - 1) * pp
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const w = idx - lo
  return sorted[lo] * (1 - w) + sorted[hi] * w
}

function summarize(values: Array<number | null>): { count: number; median: number | null; p90: number | null } {
  const arr = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  return {
    count: arr.length,
    median: percentile(arr, 0.5),
    p90: percentile(arr, 0.9),
  }
}

function computeDispatchMetrics(firstDispatchAt?: string | null, lastSentAt?: string | null, sentTotal?: number | null) {
  if (!firstDispatchAt || !lastSentAt) return { dispatchDurationMs: null, throughputMps: null }
  const start = Date.parse(firstDispatchAt)
  const end = Date.parse(lastSentAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { dispatchDurationMs: null, throughputMps: null }

  const dispatchDurationMs = Math.max(0, end - start)
  const sent = typeof sentTotal === 'number' ? sentTotal : null
  const throughputMps = dispatchDurationMs > 0 && sent !== null ? sent / (dispatchDurationMs / 1000) : null

  return { dispatchDurationMs, throughputMps }
}

type RunRow = {
  campaign_id: string
  trace_id: string
  template_name: string | null
  recipients: number | null
  sent_total: number | null
  failed_total: number | null
  skipped_total: number | null
  first_dispatch_at: string | null
  last_sent_at: string | null
  dispatch_duration_ms: number | null
  throughput_mps: number | null
  meta_avg_ms: number | null
  db_avg_ms: number | null
  saw_throughput_429: boolean | null
  config_hash: string | null
  config: any
  created_at: string
}

function buildByConfig(runs: RunRow[]) {
  const map = new Map<string, { key: string; runs: RunRow[] }>()

  for (const r of runs) {
    const key = r.config_hash || 'unknown'
    const bucket = map.get(key) || { key, runs: [] }
    bucket.runs.push(r)
    map.set(key, bucket)
  }

  const byConfig = Array.from(map.values()).map((b) => {
    const through = summarize(b.runs.map((r) => safeNumber(r.throughput_mps)))
    const meta = summarize(b.runs.map((r) => safeNumber(r.meta_avg_ms)))
    const db = summarize(b.runs.map((r) => safeNumber(r.db_avg_ms)))

    const totalRuns = b.runs.length
    const runsWith429 = b.runs.filter((r) => !!r.saw_throughput_429).length
    const lastSeen = b.runs.map((r) => r.created_at).sort().at(-1) || null
    const firstSeen = b.runs.map((r) => r.created_at).sort().at(0) || null

    // Pega um snapshot de config para mostrar rapidamente na UI
    const sampleConfig = b.runs.find((r) => r.config)?.config || null

    return {
      config_hash: b.key,
      sample_size: totalRuns,
      throughput_mps: {
        median: through.median,
        p90: through.p90,
      },
      meta_avg_ms: {
        median: meta.median,
      },
      db_avg_ms: {
        median: db.median,
      },
      throughput_429_rate: totalRuns > 0 ? runsWith429 / totalRuns : 0,
      first_seen_at: firstSeen,
      last_seen_at: lastSeen,
      config: sampleConfig,
    }
  })

  byConfig.sort((a, b) => {
    const am = a.throughput_mps.median ?? -1
    const bm = b.throughput_mps.median ?? -1
    return bm - am
  })

  return byConfig
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const rangeDays = clampInt(Number(url.searchParams.get('rangeDays') || '30'), 1, 365)
  const limit = clampInt(Number(url.searchParams.get('limit') || '200'), 1, 500)

  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString()

  // 1) Prefer run_metrics quando existir
  try {
    const { data: runs, error: runErr } = await supabase
      .from('campaign_run_metrics')
      .select('campaign_id,trace_id,template_name,recipients,sent_total,failed_total,skipped_total,first_dispatch_at,last_sent_at,dispatch_duration_ms,throughput_mps,meta_avg_ms,db_avg_ms,saw_throughput_429,config_hash,config,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (runErr) {
      const msg = String((runErr as any).message || '').toLowerCase()
      if (!msg.includes('does not exist')) {
        console.warn('[settings/performance] run_metrics query error', runErr)
      } else {
        throw runErr
      }
    }

    const safeRuns: RunRow[] = (runs as any) || []

    const throughputSummary = summarize(safeRuns.map((r) => safeNumber(r.throughput_mps)))
    const metaSummary = summarize(safeRuns.map((r) => safeNumber(r.meta_avg_ms)))
    const dbSummary = summarize(safeRuns.map((r) => safeNumber(r.db_avg_ms)))

    const totalRuns = safeRuns.length
    const runsWith429 = safeRuns.filter((r) => !!r.saw_throughput_429).length

    const byConfig = buildByConfig(safeRuns)

    return noStoreJson({
      source: 'run_metrics',
      rangeDays,
      since,
      totals: {
        runs: totalRuns,
        throughput_mps: { median: throughputSummary.median, p90: throughputSummary.p90, samples: throughputSummary.count },
        meta_avg_ms: { median: metaSummary.median, samples: metaSummary.count },
        db_avg_ms: { median: dbSummary.median, samples: dbSummary.count },
        throughput_429_rate: totalRuns > 0 ? runsWith429 / totalRuns : 0,
      },
      byConfig,
      runs: safeRuns,
    })
  } catch {
    // best-effort fallback
  }

  // 2) Fallback: usa tabela campaigns (sent-only)
  try {
    const { data: rows, error } = await supabase
      .from('campaigns')
      .select('id, created_at, template_name, total_recipients, sent, failed, skipped, first_dispatch_at, last_sent_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    const runs: RunRow[] = (rows || []).map((row: any) => {
      const sentTotal = safeNumber(row.sent)
      const { dispatchDurationMs, throughputMps } = computeDispatchMetrics(row.first_dispatch_at, row.last_sent_at, sentTotal)

      return {
        campaign_id: row.id,
        trace_id: '—',
        template_name: row.template_name ?? null,
        recipients: safeNumber(row.total_recipients),
        sent_total: sentTotal,
        failed_total: safeNumber(row.failed),
        skipped_total: safeNumber(row.skipped),
        first_dispatch_at: row.first_dispatch_at ?? null,
        last_sent_at: row.last_sent_at ?? null,
        dispatch_duration_ms: dispatchDurationMs,
        throughput_mps: throughputMps,
        meta_avg_ms: null,
        db_avg_ms: null,
        saw_throughput_429: null,
        config_hash: null,
        config: null,
        created_at: row.created_at,
      }
    })

    const throughputSummary = summarize(runs.map((r) => safeNumber(r.throughput_mps)))

    return noStoreJson({
      source: 'campaigns_fallback',
      rangeDays,
      since,
      totals: {
        runs: runs.length,
        throughput_mps: { median: throughputSummary.median, p90: throughputSummary.p90, samples: throughputSummary.count },
        meta_avg_ms: { median: null, samples: 0 },
        db_avg_ms: { median: null, samples: 0 },
        throughput_429_rate: null,
      },
      byConfig: [],
      runs,
      hint: 'Métricas avançadas (run/batch) ainda não estão disponíveis. Aplique a migration 0008_add_campaign_performance_metrics.sql no Supabase e execute novas campanhas para alimentar baselines por configuração (config_hash).',
    })
  } catch (e) {
    console.error('[settings/performance] fallback error', e)
    return noStoreJson({ error: 'Falha ao carregar performance' }, { status: 500 })
  }
}
