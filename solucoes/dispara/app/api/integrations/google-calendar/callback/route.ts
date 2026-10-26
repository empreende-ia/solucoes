import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  saveTokens,
  buildDefaultCalendarConfig,
  saveCalendarConfig,
  ensureCalendarChannel,
} from '@/lib/google-calendar'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'

const STATE_COOKIE = 'gc_oauth_state'
const RETURN_COOKIE = 'gc_oauth_return'

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const cookieState = request.cookies.get(STATE_COOKIE)?.value
    const returnTo = request.cookies.get(RETURN_COOKIE)?.value || '/settings'

    if (!code) {
      return NextResponse.json({ error: 'Codigo OAuth ausente' }, { status: 400 })
    }
    // Comparação em tempo constante (state é o anti-CSRF do OAuth)
    if (!timingSafeEqualString(state, cookieState)) {
      return NextResponse.json({ error: 'Estado OAuth invalido' }, { status: 400 })
    }

    const tokens = await exchangeCodeForTokens(code)
    await saveTokens(tokens)

    const accountEmail = await fetchGoogleAccountEmail(tokens.accessToken)
    const config = await buildDefaultCalendarConfig(accountEmail)
    await saveCalendarConfig(config)

    await ensureCalendarChannel(config.calendarId)

    // Forçar path local — nunca permitir URLs absolutas (previne open redirect)
    const safePath = returnTo.startsWith('/') ? returnTo : '/settings'
    const absoluteReturnUrl = `${url.origin}${safePath}`

    const response = NextResponse.redirect(absoluteReturnUrl)
    response.cookies.delete(STATE_COOKIE)
    response.cookies.delete(RETURN_COOKIE)
    return response
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[google-calendar] callback error:', errorMessage, error)
    return NextResponse.json({
      error: 'Falha ao concluir OAuth',
      details: errorMessage
    }, { status: 500 })
  }
}
