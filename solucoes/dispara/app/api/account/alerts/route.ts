import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const META_API_VERSION = 'v24.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`
const META_BUSINESS_LOCKED_CODE = 131031

async function graphGet(path: string, accessToken: string, params?: Record<string, string>) {
  const url = new URL(`${META_API_BASE}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, String(v))

  const res = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    timeoutMs: 8000,
  })

  const json = await safeJson<any>(res)
  return { ok: res.ok, status: res.status, json }
}

function getOverallHealthStatus(json: any): string | null {
  const hs = json?.health_status
  const overall = hs?.can_send_message
  if (typeof overall === 'string' && overall) return overall

  const entities = Array.isArray(hs?.entities) ? hs.entities : []
  if (entities.some((e: any) => String(e?.can_send_message || '') === 'BLOCKED')) return 'BLOCKED'
  if (entities.some((e: any) => String(e?.can_send_message || '') === 'LIMITED')) return 'LIMITED'
  return null
}

export interface AccountAlert {
  id: string
  type: string
  code: number | null
  message: string
  details: string | null
  dismissed: boolean
  created_at: string
}

/**
 * GET /api/account/alerts
 * Get active (non-dismissed) account alerts
 * OPTIMIZED: Uses Supabase with caching
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('account_alerts')
      .select('*')
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      if (error.message.includes('does not exist')) {
        return NextResponse.json({ alerts: [] })
      }
      throw error
    }

    let alerts: AccountAlert[] = (data || []).map(row => ({
      id: row.id,
      type: row.type,
      code: row.code,
      message: row.message,
      details: row.details,
      dismissed: row.dismissed,
      created_at: row.created_at
    }))

    // Auto-limpeza best-effort: reduz alarmismo do 131031 quando é histórico.
    // 1) Expira alertas muito antigos.
    // 2) Se existir alerta auth/131031 e Health Status não for BLOCKED, auto-dispensa.
    const now = Date.now()
    const ttlMs = 14 * 24 * 60 * 60 * 1000

    const toDismiss = new Set<string>()
    const maybeLocked = [] as AccountAlert[]

    for (const a of alerts) {
      const t = Date.parse(a.created_at)
      if (Number.isFinite(t) && now - t > ttlMs) {
        toDismiss.add(a.id)
        continue
      }
      if (a.type === 'auth' && Number(a.code) === META_BUSINESS_LOCKED_CODE) {
        maybeLocked.push(a)
      }
    }

    if (maybeLocked.length) {
      try {
        const creds = await getWhatsAppCredentials().catch(() => null)
        const accessToken = (creds as any)?.accessToken
        const phoneNumberId = (creds as any)?.phoneNumberId

        if (accessToken && phoneNumberId) {
          const hs = await graphGet(`/${phoneNumberId}`, accessToken, { fields: 'health_status' })
          if (hs.ok) {
            const overall = getOverallHealthStatus(hs.json)
            if (overall && overall !== 'BLOCKED') {
              for (const a of maybeLocked) toDismiss.add(a.id)
            }
          }
        }
      } catch {
        // best-effort
      }
    }

    if (toDismiss.size) {
      try {
        await supabase
          .from('account_alerts')
          .update({ dismissed: true })
          .in('id', Array.from(toDismiss))
      } catch {
        // best-effort
      }

      alerts = alerts.filter((a) => !toDismiss.has(a.id))
    }

    return NextResponse.json({ alerts }, {
      headers: {
        // Alertas são estado operacional (pagamento/auth). Cache compartilhado gera delays e UX confusa.
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      }
    })
  } catch (error) {
    console.error('Failed to fetch alerts:', error)
    return NextResponse.json({ alerts: [], error: (error as Error).message })
  }
}

/**
 * POST /api/account/alerts
 * Create a new account alert (mainly for testing)
 */
export async function POST(request: Request) {
  try {
    const { type, code, message, details } = await request.json()

    if (!type || !message) {
      return NextResponse.json(
        { error: 'type e message são obrigatórios' },
        { status: 400 }
      )
    }

    const id = `alert_${code || 'manual'}_${Date.now()}`
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('account_alerts')
      .insert({
        id,
        type,
        code: code || null,
        message,
        details: details ? JSON.stringify(details) : null,
        dismissed: false,
        created_at: now
      })

    if (error) throw error

    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('Failed to create alert:', error)
    return NextResponse.json(
      { error: 'Falha ao criar alerta', details: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/account/alerts
 * Dismiss an alert (mark as dismissed)
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const alertId = searchParams.get('id')
    const dismissAll = searchParams.get('all') === 'true'

    if (dismissAll) {
      const { error } = await supabase
        .from('account_alerts')
        .update({ dismissed: true })
        .neq('dismissed', true)

      if (error) throw error
      return NextResponse.json({ success: true, message: 'Todos alertas dispensados' })
    }

    if (!alertId) {
      return NextResponse.json(
        { error: 'id é obrigatório' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('account_alerts')
      .update({ dismissed: true })
      .eq('id', alertId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to dismiss alert:', error)
    return NextResponse.json(
      { error: 'Falha ao dispensar alerta', details: (error as Error).message },
      { status: 500 }
    )
  }
}
