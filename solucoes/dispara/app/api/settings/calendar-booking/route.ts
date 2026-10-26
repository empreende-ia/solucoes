import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { clampInt, boolFromUnknown } from '@/lib/validation-utils'

const CONFIG_KEY = 'calendar_booking_config'

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

interface TimeSlot {
  start: string
  end: string
}

interface WorkingHoursDay {
  day: Weekday
  enabled: boolean
  start: string
  end: string
  slots?: TimeSlot[]
}

export interface CalendarBookingConfig {
  timezone: string
  slotDurationMinutes: number
  slotBufferMinutes: number
  workingHours: WorkingHoursDay[]
  minAdvanceHours?: number
  maxAdvanceDays?: number
  allowSimultaneous?: boolean
  externalWebhookUrl?: string
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
  minAdvanceHours: 4,
  maxAdvanceDays: 14,
  allowSimultaneous: false,
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return fallback
  const [hh, mm] = trimmed.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return fallback
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback
  return trimmed
}

function normalizeSlots(slots: unknown): TimeSlot[] | undefined {
  if (!Array.isArray(slots) || slots.length === 0) return undefined
  const normalized: TimeSlot[] = []
  for (const slot of slots) {
    if (!slot || typeof slot !== 'object') continue
    const s = slot as TimeSlot
    const start = normalizeTime(s.start, '')
    const end = normalizeTime(s.end, '')
    if (start && end) {
      normalized.push({ start, end })
    }
  }
  return normalized.length > 0 ? normalized : undefined
}

function normalizeWebhookUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined
    }
    return trimmed
  } catch {
    return undefined
  }
}

function normalizeConfig(input?: Partial<CalendarBookingConfig>): CalendarBookingConfig {
  const workingHoursInput = Array.isArray(input?.workingHours) ? input?.workingHours : []
  const externalWebhookUrl = normalizeWebhookUrl(input?.externalWebhookUrl)
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
    const slots = normalizeSlots(raw.slots)
    return {
      day: defaultDay.day,
      enabled: boolFromUnknown(raw.enabled, defaultDay.enabled),
      start: normalizeTime(raw.start, defaultDay.start),
      end: normalizeTime(raw.end, defaultDay.end),
      ...(slots ? { slots } : {}),
    }
  })

  return {
    timezone: typeof input?.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : DEFAULT_CONFIG.timezone,
    slotDurationMinutes: clampInt(input?.slotDurationMinutes, 5, 240, DEFAULT_CONFIG.slotDurationMinutes),
    slotBufferMinutes: clampInt(input?.slotBufferMinutes, 0, 120, DEFAULT_CONFIG.slotBufferMinutes),
    workingHours,
    minAdvanceHours: clampInt(input?.minAdvanceHours, 0, 168, DEFAULT_CONFIG.minAdvanceHours!),
    maxAdvanceDays: clampInt(input?.maxAdvanceDays, 1, 90, DEFAULT_CONFIG.maxAdvanceDays!),
    allowSimultaneous: boolFromUnknown(input?.allowSimultaneous, DEFAULT_CONFIG.allowSimultaneous!),
    ...(externalWebhookUrl ? { externalWebhookUrl } : {}),
  }
}

async function getConfigFromDbOrDefault(): Promise<{ config: CalendarBookingConfig; source: 'db' | 'default' }> {
  let raw: string | null = null
  if (isSupabaseConfigured()) {
    try {
      raw = await settingsDb.get(CONFIG_KEY)
    } catch {
      raw = null
    }
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return { config: normalizeConfig(parsed), source: 'db' }
    } catch {
      // fallthrough
    }
  }

  return { config: DEFAULT_CONFIG, source: 'default' }
}

export async function GET() {
  try {
    const { config, source } = await getConfigFromDbOrDefault()
    return NextResponse.json({ ok: true, source, config })
  } catch (error) {
    console.error('Error fetching calendar booking config:', error)
    return NextResponse.json({ ok: true, source: 'default', config: DEFAULT_CONFIG, warning: 'Falha ao carregar config; usando default.' })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'Supabase nao configurado. Complete o setup antes de salvar.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const current = await getConfigFromDbOrDefault()

    const next = normalizeConfig({
      ...current.config,
      ...body,
      workingHours: Array.isArray(body.workingHours) ? body.workingHours : current.config.workingHours,
    })

    await settingsDb.set(CONFIG_KEY, JSON.stringify(next))

    return NextResponse.json({ ok: true, config: next })
  } catch (error) {
    console.error('Error saving calendar booking config:', error)
    return NextResponse.json({ ok: false, error: 'Falha ao salvar configuração' }, { status: 502 })
  }
}
