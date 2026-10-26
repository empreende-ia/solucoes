import { NextRequest, NextResponse } from 'next/server'
import { createOAuthState, buildGoogleCalendarAuthUrl } from '@/lib/google-calendar'

const STATE_COOKIE = 'gc_oauth_state'
const RETURN_COOKIE = 'gc_oauth_return'

function normalizeReturnTo(value: string | null): string {
  if (!value) return '/settings'
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return '/settings'
  return trimmed
}

export async function GET(request: NextRequest) {
  try {
    const state = createOAuthState()
    const authUrl = await buildGoogleCalendarAuthUrl(state)
    const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get('returnTo'))

    const response = NextResponse.redirect(authUrl)
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 10 * 60,
      path: '/',
    })
    response.cookies.set(RETURN_COOKIE, returnTo, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 10 * 60,
      path: '/',
    })
    return response
  } catch (error) {
    console.error('[google-calendar] connect error:', error)
    return NextResponse.json({ error: 'Falha ao iniciar OAuth' }, { status: 500 })
  }
}
