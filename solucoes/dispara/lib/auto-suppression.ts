import { supabase } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { getActiveSuppressionsByPhone, upsertPhoneSuppression } from '@/lib/phone-suppressions'
import { settingsDb } from '@/lib/supabase-db'

export type AutoSuppressionInput = {
  phone: string
  failureCode: number
  failureTitle?: string | null
  failureDetails?: string | null
  failureFbtraceId?: string | null
  failureSubcode?: number | null
  failureHref?: string | null
  campaignId?: string | null
  campaignContactId?: string | null
  messageId?: string | null
}

export type AutoSuppressionConfig = {
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

const CONFIG_KEY = 'auto_suppression_config'
const CACHE_TTL_MS = 30_000
let _cache: { value: AutoSuppressionConfig; at: number } | null = null

function clampInt(n: unknown, min: number, max: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.min(max, Math.max(min, Math.floor(v)))
}

function boolFromUnknown(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'on'
  if (typeof v === 'number') return v === 1
  return false
}

function defaultConfig(): AutoSuppressionConfig {
  // Agressivo por padrão; controlável via Settings (Supabase)
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

export async function getAutoSuppressionConfig(): Promise<AutoSuppressionConfig> {
  const now = Date.now()
  if (_cache && now - _cache.at < CACHE_TTL_MS) return _cache.value

  const def = defaultConfig()
  try {
    const raw = await settingsDb.get(CONFIG_KEY)
    if (!raw) {
      _cache = { value: def, at: now }
      return def
    }
    const parsed = JSON.parse(raw)
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
    _cache = { value: cfg, at: now }
    return cfg
  } catch {
    _cache = { value: def, at: now }
    return def
  }
}

function addDaysIso(days: number): string {
  const ms = Date.now() + Math.max(0, days) * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString()
}

export function shouldAutoSuppressFailureCode(code: number): boolean {
  // Mantido por compatibilidade: a decisão real é feita em maybeAutoSuppressByFailure
  // pois depende de config async (DB).
  return code === 131026
}

export function computeAutoSuppressionTtlDaysFromConfig(input: {
  cfg: AutoSuppressionConfig
  failureCode: number
  recentCount: number
}): number {
  if (input.failureCode !== 131026) return 0
  const p = input.cfg.undeliverable131026
  if (input.recentCount >= 3) return p.ttl3Days
  if (input.recentCount >= 2) return p.ttl2Days
  return p.ttlBaseDays
}

export async function maybeAutoSuppressByFailure(input: AutoSuppressionInput): Promise<{
  suppressed: boolean
  reason?: string
  expiresAt?: string
  recentCount?: number
}> {
  const normalizedPhone = normalizePhoneNumber(String(input.phone || '').trim())
  if (!normalizedPhone) return { suppressed: false }

  const failureCode = Number(input.failureCode || 0)
  if (!Number.isFinite(failureCode) || failureCode <= 0) return { suppressed: false }

  if (!shouldAutoSuppressFailureCode(failureCode)) return { suppressed: false }

  const cfg = await getAutoSuppressionConfig()
  if (!cfg.enabled) return { suppressed: false }
  if (failureCode === 131026 && !cfg.undeliverable131026.enabled) return { suppressed: false }

  // Não sobrescreve supressões já ativas (ex.: opt-out manual/inbound/meta)
  try {
    const active = await getActiveSuppressionsByPhone([normalizedPhone])
    if (active.get(normalizedPhone)) {
      return { suppressed: false, reason: 'already_suppressed' }
    }
  } catch {
    // best-effort; seguimos, pois a supressão automática também é best-effort
  }

  const windowDays = failureCode === 131026 ? cfg.undeliverable131026.windowDays : 30
  const threshold = failureCode === 131026 ? cfg.undeliverable131026.threshold : 1

  const cutoffIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  // Conta falhas recentes (cross-campaign) para o mesmo telefone
  const { count, error } = await supabase
    .from('campaign_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('phone', normalizedPhone)
    .eq('status', 'failed')
    .eq('failure_code', failureCode)
    .gte('failed_at', cutoffIso)

  if (error) throw error

  const recentCount = Number(count || 0)
  if (recentCount < threshold) return { suppressed: false, recentCount }

  const ttlDays = computeAutoSuppressionTtlDaysFromConfig({ cfg, failureCode, recentCount })
  if (ttlDays <= 0) return { suppressed: false, recentCount }

  const expiresAt = addDaysIso(ttlDays)

  const reason = `Auto-supressão: ${recentCount} falha(s) ${failureCode} (undeliverable) nos últimos ${windowDays} dias. Quarentena ${ttlDays} dias.`

  await upsertPhoneSuppression({
    phone: normalizedPhone,
    source: 'auto_failure_policy',
    reason,
    expiresAt,
    metadata: {
      type: 'auto_suppression',
      failureCode,
      windowDays,
      threshold,
      recentCount,
      ttlDays,
      config: {
        enabled: cfg.enabled,
        undeliverable131026: cfg.undeliverable131026,
      },
      last: {
        title: input.failureTitle ?? null,
        details: input.failureDetails ?? null,
        fbtrace_id: input.failureFbtraceId ?? null,
        subcode: input.failureSubcode ?? null,
        href: input.failureHref ?? null,
        campaignId: input.campaignId ?? null,
        campaignContactId: input.campaignContactId ?? null,
        messageId: input.messageId ?? null,
      },
    },
  })

  return { suppressed: true, reason, expiresAt, recentCount }
}
