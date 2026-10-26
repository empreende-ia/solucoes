import { NextResponse } from 'next/server'
import { listCalendars } from '@/lib/google-calendar'
import { isSupabaseConfigured } from '@/lib/supabase'

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
    }

    const calendars = await listCalendars()
    const payload = calendars.map((item: any) => ({
      id: String(item.id),
      summary: String(item.summary || ''),
      primary: Boolean(item.primary),
      timeZone: item.timeZone ? String(item.timeZone) : null,
    }))

    return NextResponse.json({ calendars: payload })
  } catch (error) {
    console.error('[google-calendar] calendars error:', error)
    return NextResponse.json({ error: 'Falha ao listar calendarios' }, { status: 500 })
  }
}
