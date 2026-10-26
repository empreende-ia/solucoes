import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

type TraceListItem = {
  traceId: string
  source: 'run_metrics' | 'campaign_contacts'
  createdAt?: string | null
  lastSeenAt?: string | null
  recipients?: number | null
  sentTotal?: number | null
  failedTotal?: number | null
  skippedTotal?: number | null
}

function isMissingRelationError(err: unknown): boolean {
  const anyErr = err as any
  const code = String(anyErr?.code || anyErr?.cause?.code || '')
  const message = String(anyErr?.message || anyErr?.cause?.message || '')

  // Postgres: 42P01 = undefined_table
  if (code === '42P01') return true
  // PostgREST às vezes não propaga `code` como esperamos.
  if (/does not exist/i.test(message) && /relation|table/i.test(message)) return true
  if (/undefined_table/i.test(message)) return true
  return false
}

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

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: campaignId } = await params
    if (!campaignId) return noStoreJson({ error: 'campaign id ausente' }, { status: 400 })

    const url = new URL(request.url)
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || '20'), 100))

    // 1) Prefer runs table (quando existir)
    const { data: runs, error: runsErr } = await supabase
      .from('campaign_run_metrics')
      .select('trace_id,created_at,recipients,sent_total,failed_total,skipped_total,first_dispatch_at,last_sent_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (runsErr && !isMissingRelationError(runsErr)) throw runsErr

    const out: TraceListItem[] = []
    const seen = new Set<string>()

    for (const r of runs || []) {
      const traceId = String((r as any).trace_id || '').trim()
      if (!traceId) continue
      seen.add(traceId)
      out.push({
        traceId,
        source: 'run_metrics',
        createdAt: (r as any).created_at || null,
        lastSeenAt: (r as any).last_sent_at || (r as any).first_dispatch_at || (r as any).created_at || null,
        recipients: (r as any).recipients ?? null,
        sentTotal: (r as any).sent_total ?? null,
        failedTotal: (r as any).failed_total ?? null,
        skippedTotal: (r as any).skipped_total ?? null,
      })
    }

    // 2) Fallback: traces que existem em campaign_contacts mas ainda não fecharam run_metrics
    // (ex.: travou antes de completar, ou rollout parcial das métricas).
    const remaining = Math.max(0, limit - out.length)
    if (remaining > 0) {
      const { data: rows, error: ccErr } = await supabase
        .from('campaign_contacts')
        .select('trace_id,sending_at,sent_at,failed_at,skipped_at')
        .eq('campaign_id', campaignId)
        .not('trace_id', 'is', null)
        .order('sending_at', { ascending: false, nullsFirst: false })
        .order('sent_at', { ascending: false, nullsFirst: false })
        .order('failed_at', { ascending: false, nullsFirst: false })
        .order('skipped_at', { ascending: false, nullsFirst: false })
        .limit(500)

      if (ccErr && !isMissingRelationError(ccErr)) throw ccErr

      for (const row of rows || []) {
        const traceId = String((row as any).trace_id || '').trim()
        if (!traceId) continue
        if (seen.has(traceId)) continue

        const lastSeenAt =
          (row as any).sent_at ||
          (row as any).failed_at ||
          (row as any).skipped_at ||
          (row as any).sending_at ||
          null

        seen.add(traceId)
        out.push({
          traceId,
          source: 'campaign_contacts',
          createdAt: null,
          lastSeenAt,
        })
        if (out.length >= limit) break
      }
    }

    return noStoreJson({ traces: out })
  } catch (e) {
    return noStoreJson(
      { error: 'Falha ao buscar execuções (trace)', details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

