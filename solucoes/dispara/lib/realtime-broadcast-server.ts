import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CampaignProgressBroadcastPayload } from '@/types'

// ============================================================================
// Server-side Realtime Broadcast (best-effort)
//
// Objetivo:
// - Fornecer “sensação de tempo real” na UI sem precisar escrever no Postgres.
// - NÃO é fonte da verdade (DB continua sendo a fonte da verdade).
// - Deve ser extremamente resiliente: nunca pode quebrar o envio.
//
// Observação importante:
// - Supabase Realtime Broadcast usa WebSocket.
// - Em ambientes serverless, conexões podem ser curtas. Por isso:
//   - cacheamos o client/canais quando possível;
//   - fazemos subscribe lazy;
//   - tudo é best-effort.
// ============================================================================

type ChannelKey = string

type ChannelState = {
  channel: ReturnType<SupabaseClient['channel']>
  ready: Promise<void>
  seq: number
}

let _rtClient: SupabaseClient | null = null
const _channels: Map<ChannelKey, ChannelState> = new Map()

function getRealtimeServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  if (!_rtClient) {
    _rtClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return _rtClient
}

function channelNameForCampaign(campaignId: string) {
  // Namespace próprio para evitar colisão.
  return `campaign-progress:${campaignId}`
}

async function ensureChannel(campaignId: string): Promise<ChannelState | null> {
  const client = getRealtimeServerClient()
  if (!client) return null

  const name = channelNameForCampaign(campaignId)
  const existing = _channels.get(name)
  if (existing) return existing

  const channel = client.channel(name, {
    config: {
      // Evita eco do próprio sender (não é útil no server)
      broadcast: { self: false },
      // presence desabilitado
      presence: { key: '' },
    },
  })

  const ready = new Promise<void>((resolve, reject) => {
    try {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`Realtime channel subscribe failed: ${status}`))
        }
      })
    } catch (e) {
      reject(e)
    }
  })

  const state: ChannelState = { channel, ready, seq: 0 }
  _channels.set(name, state)

  // Se falhar em conectar, remove do cache para permitir retry futuro.
  ready.catch(() => {
    _channels.delete(name)
    try {
      channel.unsubscribe()
    } catch {
      // ignore
    }
  })

  return state
}

export async function broadcastCampaignProgress(
  campaignId: string,
  payload: Omit<CampaignProgressBroadcastPayload, 'seq' | 'ts' | 'campaignId'>
): Promise<void> {
  const state = await ensureChannel(campaignId)
  if (!state) return

  // best-effort: se não conectar, silenciosamente não envia
  try {
    await state.ready
  } catch {
    return
  }

  state.seq += 1

  const message: CampaignProgressBroadcastPayload = {
    campaignId,
    ...payload,
    seq: state.seq,
    ts: Date.now(),
  }

  try {
    await state.channel.send({
      type: 'broadcast',
      event: 'campaign_progress',
      payload: message,
    })
  } catch {
    // best-effort
  }
}

export async function broadcastCampaignPhase(
  campaignId: string,
  payload: Omit<CampaignProgressBroadcastPayload, 'seq' | 'ts' | 'campaignId'> & { phase: NonNullable<CampaignProgressBroadcastPayload['phase']> }
): Promise<void> {
  const state = await ensureChannel(campaignId)
  if (!state) return

  try {
    await state.ready
  } catch {
    return
  }

  state.seq += 1

  const message: CampaignProgressBroadcastPayload = {
    campaignId,
    ...payload,
    seq: state.seq,
    ts: Date.now(),
  }

  try {
    await state.channel.send({
      type: 'broadcast',
      event: 'campaign_phase',
      payload: message,
    })
  } catch {
    // best-effort
  }
}

export function createCampaignProgressBroadcaster(opts: {
  campaignId: string
  traceId: string
  batchIndex: number
  flushIntervalMs?: number
}) {
  const flushIntervalMs = Math.max(100, Math.min(2000, opts.flushIntervalMs ?? 250))

  let pending = { sent: 0, failed: 0, skipped: 0 }
  let stopped = false
  let timer: NodeJS.Timeout | null = null

  const schedule = () => {
    if (stopped) return
    if (timer) return

    timer = setTimeout(async () => {
      timer = null
      if (stopped) return
      await flush()
    }, flushIntervalMs)
  }

  const bump = (delta: { sent?: number; failed?: number; skipped?: number }) => {
    if (stopped) return
    pending.sent += delta.sent || 0
    pending.failed += delta.failed || 0
    pending.skipped += delta.skipped || 0
    schedule()
  }

  const flush = async (extra?: { phase?: CampaignProgressBroadcastPayload['phase'] }) => {
    if (stopped) return

    const delta = pending
    const hasDelta = (delta.sent + delta.failed + delta.skipped) > 0

    // Zera antes de enviar para evitar duplicar em caso de corrida
    pending = { sent: 0, failed: 0, skipped: 0 }

    if (!hasDelta && !extra?.phase) return

    await broadcastCampaignProgress(opts.campaignId, {
      traceId: opts.traceId,
      batchIndex: opts.batchIndex,
      delta: hasDelta ? delta : undefined,
      phase: extra?.phase,
    })
  }

  const stop = async () => {
    if (stopped) return
    stopped = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    // best-effort flush final
    try {
      const delta = pending
      pending = { sent: 0, failed: 0, skipped: 0 }
      const hasDelta = (delta.sent + delta.failed + delta.skipped) > 0
      if (hasDelta) {
        await broadcastCampaignProgress(opts.campaignId, {
          traceId: opts.traceId,
          batchIndex: opts.batchIndex,
          delta,
        })
      }
    } catch {
      // ignore
    }
  }

  return { bump, flush, stop }
}
