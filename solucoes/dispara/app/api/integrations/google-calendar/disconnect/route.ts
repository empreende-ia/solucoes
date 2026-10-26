import { NextResponse } from 'next/server'
import { clearCalendarIntegration, getStoredTokens, revokeGoogleToken } from '@/lib/google-calendar'
import { isSupabaseConfigured } from '@/lib/supabase'

export async function POST() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'Supabase nao configurado' }, { status: 400 })
    }

    const tokens = await getStoredTokens()
    if (tokens?.accessToken) {
      await revokeGoogleToken(tokens.accessToken)
    }
    if (tokens?.refreshToken) {
      await revokeGoogleToken(tokens.refreshToken)
    }

    await clearCalendarIntegration()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[google-calendar] disconnect error:', error)
    return NextResponse.json({ ok: false, error: 'Falha ao desconectar' }, { status: 500 })
  }
}
