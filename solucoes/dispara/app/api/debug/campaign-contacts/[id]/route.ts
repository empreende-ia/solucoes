import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Params = { params: Promise<{ id: string }> }

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

/**
 * GET /api/debug/campaign-contacts/:id
 * Retorna um registro (sem PII) para depuração de status sent/delivered/read.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  if (!id) return noStoreJson({ ok: false, error: 'id ausente' }, { status: 400 })

  try {
    const { data, error } = await supabase
      .from('campaign_contacts')
      .select('id, campaign_id, contact_id, status, trace_id, message_id, sending_at, sent_at, delivered_at, read_at, failed_at, skipped_at, skip_code, skip_reason, failure_code, failure_title, failure_details, failure_fbtrace_id, failure_subcode, failure_href, failure_reason, error')
      .eq('id', id)
      .maybeSingle()

    if (error) return noStoreJson({ ok: false, error: error.message }, { status: 500 })
    if (!data) return noStoreJson({ ok: false, error: 'Registro não encontrado' }, { status: 404 })

    return noStoreJson({ ok: true, row: data })
  } catch (e: any) {
    return noStoreJson({ ok: false, error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}
