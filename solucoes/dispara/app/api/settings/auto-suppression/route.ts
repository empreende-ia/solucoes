import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { clampInt, boolFromUnknown } from '@/lib/validation-utils'

const CONFIG_KEY = 'auto_suppression_config'

export interface AutoSuppressionConfig {
  enabled: boolean
  undeliverable131026: {
    enabled: boolean
    windowDays: number
    threshold: number
    ttlBaseDays: number
    ttl2Days: number
    ttl3Days: number
  }
}

function defaultConfig(): AutoSuppressionConfig {
  // Agressivo por padrão (pode ser desligado no Settings)
  return {
    enabled: true,
    undeliverable131026: {
      enabled: true,
      windowDays: 30,
      threshold: 1,
      ttlBaseDays: 90,
      ttl2Days: 180,
      ttl3Days: 365,
    },
  }
}

async function getConfigFromDbOrDefault(): Promise<{ config: AutoSuppressionConfig; source: 'db' | 'default' }> {
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
      const def = defaultConfig()
      const cfg: AutoSuppressionConfig = {
        enabled: (parsed as any).enabled !== undefined ? boolFromUnknown((parsed as any).enabled) : def.enabled,
        undeliverable131026: {
          enabled:
            (parsed as any)?.undeliverable131026?.enabled !== undefined
              ? boolFromUnknown((parsed as any).undeliverable131026.enabled)
              : def.undeliverable131026.enabled,
          windowDays: clampInt((parsed as any)?.undeliverable131026?.windowDays, 1, 365) || def.undeliverable131026.windowDays,
          threshold: clampInt((parsed as any)?.undeliverable131026?.threshold, 1, 20) || def.undeliverable131026.threshold,
          ttlBaseDays: clampInt((parsed as any)?.undeliverable131026?.ttlBaseDays, 1, 3650) || def.undeliverable131026.ttlBaseDays,
          ttl2Days: clampInt((parsed as any)?.undeliverable131026?.ttl2Days, 1, 3650) || def.undeliverable131026.ttl2Days,
          ttl3Days: clampInt((parsed as any)?.undeliverable131026?.ttl3Days, 1, 3650) || def.undeliverable131026.ttl3Days,
        },
      }
      return { config: cfg, source: 'db' }
    } catch {
      // fallthrough
    }
  }

  return { config: defaultConfig(), source: 'default' }
}

export async function GET() {
  try {
    const { config, source } = await getConfigFromDbOrDefault()
    return NextResponse.json({ ok: true, source, config })
  } catch (error) {
    console.error('Error fetching auto-suppression config:', error)
    // Evita 500 para não quebrar telas que consultam config.
    return NextResponse.json({ ok: true, source: 'default', config: defaultConfig(), warning: 'Falha ao carregar config; usando default.' })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'Supabase não configurado. Complete o setup antes de salvar.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const current = await getConfigFromDbOrDefault()

    const next: AutoSuppressionConfig = {
      enabled: body.enabled !== undefined ? boolFromUnknown(body.enabled) : current.config.enabled,
      undeliverable131026: {
        enabled:
          body.undeliverable131026?.enabled !== undefined
            ? boolFromUnknown(body.undeliverable131026.enabled)
            : current.config.undeliverable131026.enabled,
        windowDays:
          body.undeliverable131026?.windowDays !== undefined
            ? clampInt(body.undeliverable131026.windowDays, 1, 365)
            : current.config.undeliverable131026.windowDays,
        threshold:
          body.undeliverable131026?.threshold !== undefined
            ? clampInt(body.undeliverable131026.threshold, 1, 20)
            : current.config.undeliverable131026.threshold,
        ttlBaseDays:
          body.undeliverable131026?.ttlBaseDays !== undefined
            ? clampInt(body.undeliverable131026.ttlBaseDays, 1, 3650)
            : current.config.undeliverable131026.ttlBaseDays,
        ttl2Days:
          body.undeliverable131026?.ttl2Days !== undefined
            ? clampInt(body.undeliverable131026.ttl2Days, 1, 3650)
            : current.config.undeliverable131026.ttl2Days,
        ttl3Days:
          body.undeliverable131026?.ttl3Days !== undefined
            ? clampInt(body.undeliverable131026.ttl3Days, 1, 3650)
            : current.config.undeliverable131026.ttl3Days,
      },
    }

    // Sanity: TTLs devem ser não-decrescentes
    if (next.undeliverable131026.ttl2Days < next.undeliverable131026.ttlBaseDays) {
      return NextResponse.json({ ok: false, error: 'ttl2Days não pode ser menor que ttlBaseDays' }, { status: 400 })
    }
    if (next.undeliverable131026.ttl3Days < next.undeliverable131026.ttl2Days) {
      return NextResponse.json({ ok: false, error: 'ttl3Days não pode ser menor que ttl2Days' }, { status: 400 })
    }

    await settingsDb.set(CONFIG_KEY, JSON.stringify(next))

    return NextResponse.json({ ok: true, config: next })
  } catch (error) {
    console.error('Error saving auto-suppression config:', error)
    return NextResponse.json({ ok: false, error: 'Failed to save config' }, { status: 502 })
  }
}
