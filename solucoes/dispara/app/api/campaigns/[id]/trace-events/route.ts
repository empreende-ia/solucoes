import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

type TraceEventRow = {
  id: string
  trace_id: string
  ts: string
  campaign_id: string | null
  step: string | null
  phase: string
  ok: boolean | null
  ms: number | null
  batch_index: number | null
  contact_id: string | null
  phone_masked: string | null
  extra: Record<string, unknown> | null
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
    const traceId = String(url.searchParams.get('traceId') || '').trim()
    if (!traceId) return noStoreJson({ error: 'traceId ausente' }, { status: 400 })

    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || '200'), 500))
    const offset = Math.max(0, Number(url.searchParams.get('offset') || '0'))
    const phase = String(url.searchParams.get('phase') || '').trim()
    const okRaw = url.searchParams.get('ok')

    let query = supabase
      .from('campaign_trace_events')
      .select('id,trace_id,ts,campaign_id,step,phase,ok,ms,batch_index,contact_id,phone_masked,extra', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .eq('trace_id', traceId)

    if (phase) query = query.eq('phase', phase)

    if (okRaw === '1' || okRaw === 'true') query = query.eq('ok', true)
    if (okRaw === '0' || okRaw === 'false') query = query.eq('ok', false)

    const { data, error, count } = await query
      .order('ts', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      if (isMissingRelationError(error)) {
        return noStoreJson({
          traceId,
          events: [],
          pagination: {
            limit,
            offset,
            total: 0,
            hasMore: false,
          },
          warning: 'Trace events indisponíveis neste ambiente (tabela campaign_trace_events ausente).',
        })
      }
      throw error
    }

    const events = (data || []) as unknown as TraceEventRow[]

    return noStoreJson({
      traceId,
      events,
      pagination: {
        limit,
        offset,
        total: count ?? null,
        hasMore: typeof count === 'number' ? offset + events.length < count : events.length === limit,
      },
    })
  } catch (e) {
    return noStoreJson(
      { error: 'Falha ao buscar trace events', details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

