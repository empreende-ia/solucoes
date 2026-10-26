import { NextRequest, NextResponse } from 'next/server'
import { getCalendarChannel, markCalendarNotification } from '@/lib/google-calendar'
import { isSupabaseConfigured } from '@/lib/supabase'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'

/**
 * Push notifications do Google Calendar (events.watch).
 *
 * Rota pública no proxy (public_route_auth): o Google não manda cookie nem API key.
 * A autenticação é o canal salvo em settings ('google_calendar_channel'):
 * - X-Goog-Channel-Token == channel.token (segredo aleatório nosso, timing-safe);
 * - X-Goog-Channel-ID == channel.id;
 * - X-Goog-Resource-ID == channel.resourceId (quando salvo).
 * Sem canal configurado → 404.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false }, { status: 404 })
    }

    const channel = await getCalendarChannel()
    if (!channel || !channel.token || !channel.id) {
      return NextResponse.json({ ok: false }, { status: 404 })
    }

    const channelToken = request.headers.get('x-goog-channel-token')
    const channelId = request.headers.get('x-goog-channel-id')
    const resourceId = request.headers.get('x-goog-resource-id')
    const resourceState = request.headers.get('x-goog-resource-state')

    const tokenOk = timingSafeEqualString(channelToken, channel.token)
    const channelOk = timingSafeEqualString(channelId, channel.id)
    const resourceOk = channel.resourceId ? timingSafeEqualString(resourceId, channel.resourceId) : true

    if (!tokenOk || !channelOk || !resourceOk) {
      console.warn('[google-calendar] webhook rejeitado: canal/token não conferem', {
        tokenOk,
        channelOk,
        resourceOk,
      })
      return NextResponse.json({ ok: false }, { status: 403 })
    }

    await markCalendarNotification({ resourceState })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[google-calendar] webhook error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// Sem efeito colateral: o Google só usa POST.
export async function GET() {
  return NextResponse.json({ ok: true })
}
