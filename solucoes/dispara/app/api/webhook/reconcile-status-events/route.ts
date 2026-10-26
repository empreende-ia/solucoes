import { NextRequest, NextResponse } from 'next/server'
import { reconcilePendingStatusEvents } from '@/lib/whatsapp-status-events'

export const dynamic = 'force-dynamic'

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

function isAuthorized(req: NextRequest): boolean {
  const secret = (process.env.DISPARA_ADMIN_KEY || process.env.DISPARA_API_KEY || '').trim()
  if (!secret) return false

  const q = req.nextUrl.searchParams.get('key')?.trim()
  if (q && q === secret) return true

  const token = getBearerToken(req)
  if (token && token === secret) return true

  return false
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const limit = typeof body?.limit === 'number' ? body.limit : undefined

  try {
    const result = await reconcilePendingStatusEvents({ limit })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const code = String((e as any)?.code || '')
    const msg = String((e as any)?.message || (e instanceof Error ? e.message : e || ''))
    const m = msg.toLowerCase()
    if (code === '42P01' || (m.includes('whatsapp_status_events') && m.includes('does not exist'))) {
      return NextResponse.json(
        { ok: false, error: 'missing_table_whatsapp_status_events', hint: 'Aplique a migration 0018 antes de usar a reconciliação.' },
        { status: 501 }
      )
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  // Allow GET for manual debugging / Vercel cron.
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const limitRaw = req.nextUrl.searchParams.get('limit')
  const limit = limitRaw ? Number(limitRaw) : undefined

  try {
    const result = await reconcilePendingStatusEvents({ limit })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const code = String((e as any)?.code || '')
    const msg = String((e as any)?.message || (e instanceof Error ? e.message : e || ''))
    const m = msg.toLowerCase()
    if (code === '42P01' || (m.includes('whatsapp_status_events') && m.includes('does not exist'))) {
      return NextResponse.json(
        { ok: false, error: 'missing_table_whatsapp_status_events', hint: 'Aplique a migration 0018 antes de usar a reconciliação.' },
        { status: 501 }
      )
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
