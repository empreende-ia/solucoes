import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase'
import { settingsDb } from '@/lib/supabase-db'
import { getGoogleCalendarCredentialsPublic } from '@/lib/google-calendar'

const CLIENT_ID_KEY = 'googleCalendarClientId'
const CLIENT_SECRET_KEY = 'googleCalendarClientSecret'

export async function GET() {
  try {
    const config = await getGoogleCalendarCredentialsPublic()
    return NextResponse.json(config)
  } catch (error) {
    console.error('[google-calendar] credentials get error:', error)
    return NextResponse.json({ error: 'Falha ao carregar credenciais' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const clientId = String(body?.clientId || '').trim()
    const clientSecret = String(body?.clientSecret || '').trim()

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Client ID e Client Secret sao obrigatorios' }, { status: 400 })
    }

    await settingsDb.set(CLIENT_ID_KEY, clientId)
    await settingsDb.set(CLIENT_SECRET_KEY, clientSecret)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[google-calendar] credentials save error:', error)
    return NextResponse.json({ error: 'Falha ao salvar credenciais' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
    }

    await settingsDb.set(CLIENT_ID_KEY, '')
    await settingsDb.set(CLIENT_SECRET_KEY, '')

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[google-calendar] credentials delete error:', error)
    return NextResponse.json({ error: 'Falha ao remover credenciais' }, { status: 500 })
  }
}
