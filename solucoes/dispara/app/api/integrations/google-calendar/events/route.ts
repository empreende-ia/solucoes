import { NextRequest, NextResponse } from 'next/server'
import { createEvent, getCalendarConfig } from '@/lib/google-calendar'
import { isSupabaseConfigured } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const calendarId = String(body?.calendarId || '') || (await getCalendarConfig())?.calendarId
    if (!calendarId) {
      return NextResponse.json({ error: 'calendarId ausente' }, { status: 400 })
    }

    const start = String(body?.start || '')
    const end = String(body?.end || '')
    const timeZone = body?.timeZone ? String(body.timeZone) : undefined

    if (!start || !end) {
      return NextResponse.json({ error: 'start e end sao obrigatorios' }, { status: 400 })
    }

    const summary = body?.summary ? String(body.summary) : 'Agendamento via Dispara'
    const description = body?.description ? String(body.description) : undefined
    const attendees = Array.isArray(body?.attendees) ? body.attendees : undefined

    const extendedProperties = body?.extendedProperties && typeof body.extendedProperties === 'object'
      ? body.extendedProperties
      : undefined

    const event = {
      summary,
      description,
      start: { dateTime: start, timeZone },
      end: { dateTime: end, timeZone },
      attendees,
      extendedProperties,
    }

    const created = await createEvent({ calendarId, event })

    return NextResponse.json({
      id: created?.id || null,
      htmlLink: created?.htmlLink || null,
      status: created?.status || null,
    })
  } catch (error) {
    console.error('[google-calendar] create event error:', error)
    return NextResponse.json({ error: 'Falha ao criar evento' }, { status: 500 })
  }
}
