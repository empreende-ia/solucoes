import { NextRequest, NextResponse } from 'next/server'
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz'
import { addMinutes } from 'date-fns'
import { getCalendarConfig, listBusyTimes } from '@/lib/google-calendar'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { clampInt, boolFromUnknown } from '@/lib/validation-utils'

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

type WorkingHoursDay = {
  day: Weekday
  enabled: boolean
  start: string
  end: string
}

type CalendarBookingConfig = {
  timezone: string
  slotDurationMinutes: number
  slotBufferMinutes: number
  workingHours: WorkingHoursDay[]
}

const DEFAULT_CONFIG: CalendarBookingConfig = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  slotBufferMinutes: 10,
  workingHours: [
    { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
    { day: 'tue', enabled: true, start: '09:00', end: '18:00' },
    { day: 'wed', enabled: true, start: '09:00', end: '18:00' },
    { day: 'thu', enabled: true, start: '09:00', end: '18:00' },
    { day: 'fri', enabled: true, start: '09:00', end: '18:00' },
    { day: 'sat', enabled: false, start: '09:00', end: '13:00' },
    { day: 'sun', enabled: false, start: '09:00', end: '13:00' },
  ],
}

const WEEKDAY_KEYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return fallback
  const [hh, mm] = trimmed.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return fallback
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback
  return trimmed
}

function normalizeConfig(input?: Partial<CalendarBookingConfig>): CalendarBookingConfig {
  const workingHoursInput = Array.isArray(input?.workingHours) ? input?.workingHours : []
  const byDay = new Map<Weekday, Partial<WorkingHoursDay>>()
  for (const entry of workingHoursInput) {
    if (!entry || typeof entry !== 'object') continue
    const day = (entry as WorkingHoursDay).day
    if (!day || !DEFAULT_CONFIG.workingHours.find((d) => d.day === day)) continue
    byDay.set(day, entry as WorkingHoursDay)
  }

  const workingHours = DEFAULT_CONFIG.workingHours.map((defaultDay) => {
    const raw = byDay.get(defaultDay.day)
    if (!raw) return defaultDay
    return {
      day: defaultDay.day,
      enabled: boolFromUnknown(raw.enabled, defaultDay.enabled),
      start: normalizeTime(raw.start, defaultDay.start),
      end: normalizeTime(raw.end, defaultDay.end),
    }
  })

  return {
    timezone: typeof input?.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : DEFAULT_CONFIG.timezone,
    slotDurationMinutes: clampInt(input?.slotDurationMinutes, 5, 240, DEFAULT_CONFIG.slotDurationMinutes),
    slotBufferMinutes: clampInt(input?.slotBufferMinutes, 0, 120, DEFAULT_CONFIG.slotBufferMinutes),
    workingHours,
  }
}

function parseTimeToMinutes(value: string): number {
  const [hh, mm] = value.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60) % 24
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function parseDateParam(value: string | null, timeZone: string, fallback: Date, isEnd: boolean): Date {
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback

  if (trimmed.includes('T')) {
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const time = isEnd ? '23:59:59' : '00:00:00'
  return fromZonedTime(`${trimmed}T${time}`, timeZone)
}

function alignToNextSlot(date: Date, timeZone: string, slotMinutes: number): Date {
  const local = toZonedTime(date, timeZone)
  const localMinutes = local.getHours() * 60 + local.getMinutes()
  const nextMinutes = Math.ceil(localMinutes / slotMinutes) * slotMinutes
  const dateStr = formatInTimeZone(date, timeZone, 'yyyy-MM-dd')
  const timeStr = minutesToTime(nextMinutes)
  return fromZonedTime(`${dateStr}T${timeStr}`, timeZone)
}

function isSlotInsideWorkingHours(params: {
  start: Date
  end: Date
  timeZone: string
  workingHours: WorkingHoursDay[]
}): boolean {
  const isoDay = Number(formatInTimeZone(params.start, params.timeZone, 'i'))
  const dayKey = WEEKDAY_KEYS[isoDay - 1]
  const workingDay = params.workingHours.find((d) => d.day === dayKey)
  if (!workingDay || !workingDay.enabled) return false

  const localStart = toZonedTime(params.start, params.timeZone)
  const localEnd = toZonedTime(params.end, params.timeZone)

  const startDay = Number(formatInTimeZone(params.start, params.timeZone, 'i'))
  const endDay = Number(formatInTimeZone(params.end, params.timeZone, 'i'))
  if (startDay !== endDay) return false

  const startMinutes = localStart.getHours() * 60 + localStart.getMinutes()
  const endMinutes = localEnd.getHours() * 60 + localEnd.getMinutes()

  const windowStart = parseTimeToMinutes(workingDay.start)
  const windowEnd = parseTimeToMinutes(workingDay.end)

  return startMinutes >= windowStart && endMinutes <= windowEnd
}

function overlapsBusy(startMs: number, endMs: number, busy: Array<{ startMs: number; endMs: number }>): boolean {
  for (const interval of busy) {
    if (startMs < interval.endMs && endMs > interval.startMs) {
      return true
    }
  }
  return false
}

async function getCalendarBookingConfig(): Promise<CalendarBookingConfig> {
  if (!isSupabaseConfigured()) return DEFAULT_CONFIG
  const raw = await settingsDb.get('calendar_booking_config')
  if (!raw) return DEFAULT_CONFIG
  try {
    return normalizeConfig(JSON.parse(raw))
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
    }

    const params = request.nextUrl.searchParams
    const limit = clampInt(params.get('limit'), 1, 500, 200)

    // Buscar configs em paralelo para reduzir latência
    const [storedConfig, bookingConfig] = await Promise.all([
      getCalendarConfig(),
      getCalendarBookingConfig(),
    ])

    const calendarId = params.get('calendarId') || storedConfig?.calendarId
    if (!calendarId) {
      return NextResponse.json({ error: 'calendarId ausente' }, { status: 400 })
    }
    const timeZone = bookingConfig.timezone || storedConfig?.calendarTimeZone || DEFAULT_CONFIG.timezone

    const now = new Date()
    const startRaw = parseDateParam(params.get('start'), timeZone, now, false)
    const endFallback = addMinutes(startRaw, 7 * 24 * 60)
    const endRaw = parseDateParam(params.get('end'), timeZone, endFallback, true)

    const start = alignToNextSlot(startRaw < now ? now : startRaw, timeZone, bookingConfig.slotDurationMinutes)
    const end = endRaw

    if (end <= start) {
      return NextResponse.json({ error: 'Intervalo invalido' }, { status: 400 })
    }

    const busyItems = await listBusyTimes({
      calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone,
    })

    const bufferMs = bookingConfig.slotBufferMinutes * 60 * 1000
    const busy = busyItems.map((item) => ({
      startMs: new Date(item.start).getTime(),
      endMs: new Date(item.end).getTime(),
    }))

    const slots: Array<{ start: string; end: string }>=[]
    let cursor = start
    const slotMs = bookingConfig.slotDurationMinutes * 60 * 1000

    while (cursor.getTime() + slotMs <= end.getTime()) {
      const slotEnd = new Date(cursor.getTime() + slotMs)
      const slotStartMs = cursor.getTime()
      const slotEndMs = slotEnd.getTime()

      if (
        isSlotInsideWorkingHours({
          start: cursor,
          end: slotEnd,
          timeZone,
          workingHours: bookingConfig.workingHours,
        }) &&
        !overlapsBusy(slotStartMs - bufferMs, slotEndMs + bufferMs, busy)
      ) {
        slots.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
        })
        if (slots.length >= limit) break
      }

      cursor = new Date(cursor.getTime() + slotMs)
    }

    return NextResponse.json({
      calendarId,
      timeZone,
      slotDurationMinutes: bookingConfig.slotDurationMinutes,
      slotBufferMinutes: bookingConfig.slotBufferMinutes,
      slots,
    })
  } catch (error) {
    console.error('[google-calendar] slots error:', error)
    return NextResponse.json({ error: 'Falha ao calcular slots' }, { status: 500 })
  }
}
