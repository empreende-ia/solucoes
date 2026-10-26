import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { getAdaptiveThrottleState, setAdaptiveThrottleState } from '@/lib/whatsapp-adaptive-throttle'
import { isSupabaseConfigured } from '@/lib/supabase'
import { clampInt, boolFromUnknown } from '@/lib/validation-utils'

const CONFIG_KEY = 'whatsapp_adaptive_throttle_config'

export interface WhatsAppAdaptiveThrottleConfig {
  enabled: boolean
  sendConcurrency: number
  batchSize: number
  startMps: number
  maxMps: number
  minMps: number
  cooldownSec: number
  minIncreaseGapSec: number
  sendFloorDelayMs: number
}

function configFromEnv(): WhatsAppAdaptiveThrottleConfig {
  return {
    enabled: process.env.WHATSAPP_ADAPTIVE_THROTTLE === '1',
    sendConcurrency: clampInt(process.env.WHATSAPP_SEND_CONCURRENCY ?? '1', 1, 50),
    batchSize: clampInt(process.env.WHATSAPP_WORKFLOW_BATCH_SIZE ?? '10', 1, 200),
    startMps: clampInt(process.env.WHATSAPP_ADAPTIVE_START_MPS ?? '30', 1, 1000),
    maxMps: clampInt(process.env.WHATSAPP_ADAPTIVE_MAX_MPS ?? '80', 1, 1000),
    minMps: clampInt(process.env.WHATSAPP_ADAPTIVE_MIN_MPS ?? '5', 1, 1000),
    cooldownSec: clampInt(process.env.WHATSAPP_ADAPTIVE_COOLDOWN_SEC ?? '30', 1, 600),
    minIncreaseGapSec: clampInt(process.env.WHATSAPP_ADAPTIVE_MIN_INCREASE_GAP_SEC ?? '10', 1, 600),
    sendFloorDelayMs: clampInt(process.env.WHATSAPP_SEND_FLOOR_DELAY_MS ?? '0', 0, 5000),
  }
}

async function getConfigFromDbOrEnv(): Promise<{ config: WhatsAppAdaptiveThrottleConfig; source: 'db' | 'env' }> {
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
      const env = configFromEnv()
      const config: WhatsAppAdaptiveThrottleConfig = {
        enabled: boolFromUnknown((parsed as any).enabled),
        sendConcurrency: clampInt((parsed as any).sendConcurrency, 1, 50) || env.sendConcurrency,
        batchSize: clampInt((parsed as any).batchSize, 1, 200) || env.batchSize,
        startMps: clampInt((parsed as any).startMps, 1, 1000) || env.startMps,
        maxMps: clampInt((parsed as any).maxMps, 1, 1000) || env.maxMps,
        minMps: clampInt((parsed as any).minMps, 1, 1000) || env.minMps,
        cooldownSec: clampInt((parsed as any).cooldownSec, 1, 600) || env.cooldownSec,
        minIncreaseGapSec: clampInt((parsed as any).minIncreaseGapSec, 1, 600) || env.minIncreaseGapSec,
        sendFloorDelayMs: clampInt((parsed as any).sendFloorDelayMs, 0, 5000) || env.sendFloorDelayMs,
      }
      return { config, source: 'db' }
    } catch {
      // fallthrough to env
    }
  }

  return { config: configFromEnv(), source: 'env' }
}

export async function GET() {
  try {
    const credentials = await getWhatsAppCredentials()
    const phoneNumberId = credentials?.phoneNumberId || null

    const { config, source } = await getConfigFromDbOrEnv()

    let state = null
    if (phoneNumberId) {
      state = await getAdaptiveThrottleState(phoneNumberId)
    }

    return NextResponse.json({
      ok: true,
      source,
      phoneNumberId,
      config,
      state,
    })
  } catch (error) {
    console.error('Error fetching whatsapp throttle config:', error)
    // Evita 500 para não quebrar UX; devolve config do env como fallback.
    return NextResponse.json({ ok: true, source: 'env', phoneNumberId: null, config: configFromEnv(), state: null, warning: 'Falha ao carregar config; usando env.' })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'Supabase não configurado. Complete o setup antes de salvar.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))

    const current = await getConfigFromDbOrEnv()

    const next: WhatsAppAdaptiveThrottleConfig = {
      enabled: body.enabled !== undefined ? boolFromUnknown(body.enabled) : current.config.enabled,
      sendConcurrency: body.sendConcurrency !== undefined ? clampInt(body.sendConcurrency, 1, 50) : current.config.sendConcurrency,
      batchSize: body.batchSize !== undefined ? clampInt(body.batchSize, 1, 200) : current.config.batchSize,
      startMps: body.startMps !== undefined ? clampInt(body.startMps, 1, 1000) : current.config.startMps,
      maxMps: body.maxMps !== undefined ? clampInt(body.maxMps, 1, 1000) : current.config.maxMps,
      minMps: body.minMps !== undefined ? clampInt(body.minMps, 1, 1000) : current.config.minMps,
      cooldownSec: body.cooldownSec !== undefined ? clampInt(body.cooldownSec, 1, 600) : current.config.cooldownSec,
      minIncreaseGapSec: body.minIncreaseGapSec !== undefined ? clampInt(body.minIncreaseGapSec, 1, 600) : current.config.minIncreaseGapSec,
      sendFloorDelayMs: body.sendFloorDelayMs !== undefined ? clampInt(body.sendFloorDelayMs, 0, 5000) : current.config.sendFloorDelayMs,
    }

    // Basic sanity
    if (next.minMps > next.maxMps) {
      return NextResponse.json({ ok: false, error: 'minMps não pode ser maior que maxMps' }, { status: 400 })
    }
    if (next.startMps < next.minMps || next.startMps > next.maxMps) {
      return NextResponse.json({ ok: false, error: 'startMps deve estar entre minMps e maxMps' }, { status: 400 })
    }

    await settingsDb.set(CONFIG_KEY, JSON.stringify(next))

    // Optional: reset learning state for current phone number
    if (body.resetState === true) {
      const credentials = await getWhatsAppCredentials()
      const phoneNumberId = credentials?.phoneNumberId
      if (phoneNumberId) {
        await setAdaptiveThrottleState(phoneNumberId, {
          targetMps: next.startMps,
          cooldownUntil: null,
          lastIncreaseAt: null,
          lastDecreaseAt: null,
          updatedAt: new Date().toISOString(),
        })
      }
    }

    return NextResponse.json({ ok: true, config: next })
  } catch (error) {
    console.error('Error saving whatsapp throttle config:', error)
    return NextResponse.json({ ok: false, error: 'Failed to save config' }, { status: 502 })
  }
}
