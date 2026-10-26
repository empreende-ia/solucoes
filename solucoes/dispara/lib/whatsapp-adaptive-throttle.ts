import { settingsDb } from '@/lib/supabase-db'
import { MAX_RATE_LIMIT, MIN_RATE_LIMIT } from '@/lib/rate-limiter'

/**
 * Adaptive throttle (AIMD-ish) baseado no feedback do erro 130429.
 *
 * Objetivo: encontrar automaticamente um alvo de msgs/seg (MPS) seguro para o Cloud API,
 * aumentando devagar quando está estável e reduzindo rápido quando estoura throughput.
 *
 * IMPORTANTE:
 * - Isso NÃO substitui o limite "pair" (1 msg/6s por usuário). É um controle global.
 * - Em serverless, o estado precisa ser compartilhado (aqui via tabela `settings`).
 */

export interface AdaptiveThrottleState {
  targetMps: number
  cooldownUntil?: string | null
  lastIncreaseAt?: string | null
  lastDecreaseAt?: string | null
  updatedAt?: string | null
}

export interface AdaptiveThrottleConfig {
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

export type AdaptiveThrottleConfigSource = 'db' | 'env'

export interface AdaptiveThrottleConfigWithSource {
  config: AdaptiveThrottleConfig
  source: AdaptiveThrottleConfigSource
  /** true quando havia algum valor no DB (mesmo que inválido/parse falhou). */
  rawPresent: boolean
}

const KEY_PREFIX = 'whatsapp_adaptive_mps_state:'
const CONFIG_KEY = 'whatsapp_adaptive_throttle_config'

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseJsonState(raw: string | null): AdaptiveThrottleState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const targetMps = clampInt(Number((parsed as any).targetMps), MIN_RATE_LIMIT, MAX_RATE_LIMIT)

    return {
      targetMps,
      cooldownUntil: (parsed as any).cooldownUntil ?? null,
      lastIncreaseAt: (parsed as any).lastIncreaseAt ?? null,
      lastDecreaseAt: (parsed as any).lastDecreaseAt ?? null,
      updatedAt: (parsed as any).updatedAt ?? null,
    }
  } catch {
    return null
  }
}

function defaultState(): AdaptiveThrottleState {
  const start = clampInt(Number(process.env.WHATSAPP_ADAPTIVE_START_MPS || '20'), MIN_RATE_LIMIT, MAX_RATE_LIMIT)
  return {
    targetMps: start,
    cooldownUntil: null,
    lastIncreaseAt: null,
    lastDecreaseAt: null,
    updatedAt: nowIso(),
  }
}

function configFromEnv(): AdaptiveThrottleConfig {
  // Defaults: Balanced profile (ativado por padrão, valores conservadores que sobem automaticamente)
  const enabledEnv = process.env.WHATSAPP_ADAPTIVE_THROTTLE
  const enabled = enabledEnv === undefined ? true : enabledEnv === '1' // Default: true

  return {
    enabled,
    sendConcurrency: clampInt(Number(process.env.WHATSAPP_SEND_CONCURRENCY || '2'), 1, 50),
    batchSize: clampInt(Number(process.env.WHATSAPP_WORKFLOW_BATCH_SIZE || '40'), 1, 200),
    startMps: clampInt(Number(process.env.WHATSAPP_ADAPTIVE_START_MPS || '20'), MIN_RATE_LIMIT, MAX_RATE_LIMIT),
    maxMps: clampInt(Number(process.env.WHATSAPP_ADAPTIVE_MAX_MPS || '80'), MIN_RATE_LIMIT, MAX_RATE_LIMIT),
    minMps: clampInt(Number(process.env.WHATSAPP_ADAPTIVE_MIN_MPS || '5'), MIN_RATE_LIMIT, MAX_RATE_LIMIT),
    cooldownSec: clampInt(Number(process.env.WHATSAPP_ADAPTIVE_COOLDOWN_SEC || '30'), 1, 600),
    minIncreaseGapSec: clampInt(Number(process.env.WHATSAPP_ADAPTIVE_MIN_INCREASE_GAP_SEC || '10'), 1, 600),
    sendFloorDelayMs: clampInt(Number(process.env.WHATSAPP_SEND_FLOOR_DELAY_MS || '0'), 0, 5000),
  }
}

function parseConfig(raw: string | null): AdaptiveThrottleConfig | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const env = configFromEnv()

    const enabledRaw = (parsed as any).enabled
    const enabled = typeof enabledRaw === 'boolean'
      ? enabledRaw
      : typeof enabledRaw === 'string'
        ? (enabledRaw === '1' || enabledRaw.toLowerCase() === 'true' || enabledRaw.toLowerCase() === 'on')
        : Boolean(enabledRaw)

    const startMps = clampInt(Number((parsed as any).startMps ?? env.startMps), MIN_RATE_LIMIT, MAX_RATE_LIMIT)
    const sendConcurrency = clampInt(Number((parsed as any).sendConcurrency ?? env.sendConcurrency), 1, 50)
    const batchSize = clampInt(Number((parsed as any).batchSize ?? env.batchSize), 1, 200)
    const maxMps = clampInt(Number((parsed as any).maxMps ?? env.maxMps), MIN_RATE_LIMIT, MAX_RATE_LIMIT)
    const minMps = clampInt(Number((parsed as any).minMps ?? env.minMps), MIN_RATE_LIMIT, MAX_RATE_LIMIT)
    const cooldownSec = clampInt(Number((parsed as any).cooldownSec ?? env.cooldownSec), 1, 600)
    const minIncreaseGapSec = clampInt(Number((parsed as any).minIncreaseGapSec ?? env.minIncreaseGapSec), 1, 600)
    const sendFloorDelayMs = clampInt(Number((parsed as any).sendFloorDelayMs ?? env.sendFloorDelayMs), 0, 5000)

    const safeMax = Math.max(minMps, maxMps)
    const safeStart = Math.min(safeMax, Math.max(minMps, startMps))

    return {
      enabled,
      sendConcurrency,
      batchSize,
      startMps: safeStart,
      maxMps: safeMax,
      minMps,
      cooldownSec,
      minIncreaseGapSec,
      sendFloorDelayMs,
    }
  } catch {
    return null
  }
}

export async function getAdaptiveThrottleConfig(): Promise<AdaptiveThrottleConfig> {
  const res = await getAdaptiveThrottleConfigWithSource()
  return res.config
}

export async function getAdaptiveThrottleConfigWithSource(): Promise<AdaptiveThrottleConfigWithSource> {
  const raw = await settingsDb.get(CONFIG_KEY)
  const rawPresent = typeof raw === 'string' && raw.trim().length > 0
  const parsed = parseConfig(raw)
  if (parsed) {
    return { config: parsed, source: 'db', rawPresent }
  }
  return { config: configFromEnv(), source: 'env', rawPresent }
}

function isInCooldown(state: AdaptiveThrottleState, nowMs: number): boolean {
  if (!state.cooldownUntil) return false
  const until = Date.parse(state.cooldownUntil)
  if (!Number.isFinite(until)) return false
  return nowMs < until
}

export async function getAdaptiveThrottleState(phoneNumberId: string): Promise<AdaptiveThrottleState> {
  const key = `${KEY_PREFIX}${phoneNumberId}`
  const raw = await settingsDb.get(key)
  const parsed = parseJsonState(raw)
  if (parsed) return parsed

  const cfg = await getAdaptiveThrottleConfig().catch(() => null)
  const initial: AdaptiveThrottleState = cfg
    ? {
      targetMps: clampInt(cfg.startMps, MIN_RATE_LIMIT, MAX_RATE_LIMIT),
      cooldownUntil: null,
      lastIncreaseAt: null,
      lastDecreaseAt: null,
      updatedAt: nowIso(),
    }
    : defaultState()
  await settingsDb.set(key, JSON.stringify(initial))
  return initial
}

export async function setAdaptiveThrottleState(phoneNumberId: string, state: AdaptiveThrottleState): Promise<void> {
  const key = `${KEY_PREFIX}${phoneNumberId}`
  const next: AdaptiveThrottleState = {
    ...state,
    targetMps: clampInt(state.targetMps, MIN_RATE_LIMIT, MAX_RATE_LIMIT),
    updatedAt: nowIso(),
  }
  await settingsDb.set(key, JSON.stringify(next))
}

export interface AdaptiveThrottleUpdateResult {
  previous: AdaptiveThrottleState
  next: AdaptiveThrottleState
  changed: boolean
  reason: 'increase' | 'decrease' | 'noop'
}

/**
 * Chamado quando NÃO houve 130429 no batch e queremos "pisar" um pouco no acelerador.
 */
export async function recordStableBatch(phoneNumberId: string, opts?: { minSecondsBetweenIncreases?: number }): Promise<AdaptiveThrottleUpdateResult> {
  const cfg = await getAdaptiveThrottleConfig().catch(() => configFromEnv())
  const minGapSec = Math.max(3, Number(opts?.minSecondsBetweenIncreases ?? cfg.minIncreaseGapSec))
  const maxMps = clampInt(cfg.maxMps, MIN_RATE_LIMIT, MAX_RATE_LIMIT)

  const prev = await getAdaptiveThrottleState(phoneNumberId)
  const nowMs = Date.now()

  if (isInCooldown(prev, nowMs)) {
    return { previous: prev, next: prev, changed: false, reason: 'noop' }
  }

  // Evita aumentar a cada batch; segura um mínimo de tempo entre aumentos.
  const lastIncMs = prev.lastIncreaseAt ? Date.parse(prev.lastIncreaseAt) : NaN
  if (Number.isFinite(lastIncMs) && nowMs - lastIncMs < minGapSec * 1000) {
    return { previous: prev, next: prev, changed: false, reason: 'noop' }
  }

  // AIMD: aumento aditivo pequeno (com passo proporcional mínimo)
  const step = clampInt(Math.max(1, Math.round(prev.targetMps * 0.05)), 1, 50)
  const nextTarget = clampInt(prev.targetMps + step, MIN_RATE_LIMIT, maxMps)

  if (nextTarget === prev.targetMps) {
    return { previous: prev, next: prev, changed: false, reason: 'noop' }
  }

  const next: AdaptiveThrottleState = {
    ...prev,
    targetMps: nextTarget,
    lastIncreaseAt: nowIso(),
    updatedAt: nowIso(),
  }

  await setAdaptiveThrottleState(phoneNumberId, next)
  return { previous: prev, next, changed: true, reason: 'increase' }
}

/**
 * Chamado quando detectamos 130429 (throughput estourado).
 */
export async function recordThroughputExceeded(phoneNumberId: string, opts?: { cooldownSeconds?: number }): Promise<AdaptiveThrottleUpdateResult> {
  const cfg = await getAdaptiveThrottleConfig().catch(() => configFromEnv())
  const cooldownSec = clampInt(Number(opts?.cooldownSeconds ?? cfg.cooldownSec), 1, 600)
  const minMps = clampInt(cfg.minMps, MIN_RATE_LIMIT, MAX_RATE_LIMIT)

  const prev = await getAdaptiveThrottleState(phoneNumberId)

  // AIMD: redução multiplicativa forte
  const nextTarget = clampInt(Math.floor(prev.targetMps * 0.6), minMps, MAX_RATE_LIMIT)

  // Mesmo que não mude (já no mínimo), ainda aplicamos cooldown para parar de insistir.
  const cooldownUntil = new Date(Date.now() + cooldownSec * 1000).toISOString()

  const next: AdaptiveThrottleState = {
    ...prev,
    targetMps: nextTarget,
    cooldownUntil,
    lastDecreaseAt: nowIso(),
    updatedAt: nowIso(),
  }

  await setAdaptiveThrottleState(phoneNumberId, next)
  return { previous: prev, next, changed: nextTarget !== prev.targetMps, reason: 'decrease' }
}
