import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function ensureDev() {
  return process.env.NODE_ENV === 'development'
}

export async function POST(request: NextRequest) {
  if (!ensureDev()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''

  if (!url || !token) {
    return NextResponse.json({ ok: false, error: 'missing-params' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(url)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-url' }, { status: 400 })
  }

  if (!/^https?:$/.test(target.protocol)) {
    return NextResponse.json({ ok: false, error: 'invalid-protocol' }, { status: 400 })
  }

  target.searchParams.set('hub.mode', 'subscribe')
  target.searchParams.set('hub.verify_token', token)
  target.searchParams.set('hub.challenge', 'ok')

  try {
    const res = await fetch(target.toString(), { method: 'GET', cache: 'no-store' })
    const text = await res.text().catch(() => '')
    const ok = res.status === 200 && text.trim() === 'ok'
    return NextResponse.json({
      ok,
      status: res.status,
      response: text.slice(0, 200),
      message: ok ? 'ok' : 'Resposta inesperada',
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'fetch-failed', message: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    )
  }
}
