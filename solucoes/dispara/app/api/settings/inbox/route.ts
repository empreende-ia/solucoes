/**
 * T071: Inbox Settings API
 * Manages inbox-related configuration like retention days and human mode timeout
 */

import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { z } from 'zod'

const INBOX_RETENTION_KEY = 'inbox_retention_days'
const HUMAN_MODE_TIMEOUT_KEY = 'inbox_human_mode_timeout_hours'
const DEFAULT_RETENTION_DAYS = 365
const DEFAULT_HUMAN_MODE_TIMEOUT_HOURS = 0 // 0 = nunca expira (padrão recomendado)

const InboxSettingsSchema = z.object({
  retention_days: z.number().int().min(7).max(365).optional(),
  human_mode_timeout_hours: z.number().int().min(0).max(168).optional(), // 0-168 hours (0 = never, max 7 days)
})

export async function GET() {
  try {
    const [retentionRaw, timeoutRaw] = await Promise.all([
      settingsDb.get(INBOX_RETENTION_KEY),
      settingsDb.get(HUMAN_MODE_TIMEOUT_KEY),
    ])

    const retentionDays = retentionRaw ? parseInt(retentionRaw, 10) : DEFAULT_RETENTION_DAYS
    const humanModeTimeoutHours = timeoutRaw ? parseInt(timeoutRaw, 10) : DEFAULT_HUMAN_MODE_TIMEOUT_HOURS

    return NextResponse.json({
      retention_days: isNaN(retentionDays) ? DEFAULT_RETENTION_DAYS : retentionDays,
      human_mode_timeout_hours: isNaN(humanModeTimeoutHours) ? DEFAULT_HUMAN_MODE_TIMEOUT_HOURS : humanModeTimeoutHours,
    })
  } catch (error) {
    console.error('[inbox-settings] GET error:', error)
    return NextResponse.json(
      { error: 'Erro ao carregar configurações do inbox' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = InboxSettingsSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { retention_days, human_mode_timeout_hours } = parsed.data

    // Save settings in parallel
    const updates: Promise<void>[] = []

    if (retention_days !== undefined) {
      updates.push(settingsDb.set(INBOX_RETENTION_KEY, String(retention_days)))
    }

    if (human_mode_timeout_hours !== undefined) {
      updates.push(settingsDb.set(HUMAN_MODE_TIMEOUT_KEY, String(human_mode_timeout_hours)))
    }

    await Promise.all(updates)

    // Return updated settings
    const [retentionRaw, timeoutRaw] = await Promise.all([
      settingsDb.get(INBOX_RETENTION_KEY),
      settingsDb.get(HUMAN_MODE_TIMEOUT_KEY),
    ])

    const currentRetention = retentionRaw ? parseInt(retentionRaw, 10) : DEFAULT_RETENTION_DAYS
    const currentTimeout = timeoutRaw ? parseInt(timeoutRaw, 10) : DEFAULT_HUMAN_MODE_TIMEOUT_HOURS

    return NextResponse.json({
      retention_days: isNaN(currentRetention) ? DEFAULT_RETENTION_DAYS : currentRetention,
      human_mode_timeout_hours: isNaN(currentTimeout) ? DEFAULT_HUMAN_MODE_TIMEOUT_HOURS : currentTimeout,
      message: 'Configurações salvas',
    })
  } catch (error) {
    console.error('[inbox-settings] PATCH error:', error)
    return NextResponse.json(
      { error: 'Erro ao salvar configurações do inbox' },
      { status: 500 }
    )
  }
}
