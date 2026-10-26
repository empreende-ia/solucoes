import { supabase } from '@/lib/supabase'

export type WhatsAppStatus = 'sent' | 'delivered' | 'read' | 'failed'

export type WhatsAppWebhookStatusUpdate = {
  id?: string
  status?: string
  timestamp?: string | number
  recipient_id?: string
  errors?: any
}

export function normalizeMetaStatus(input: unknown): WhatsAppStatus | null {
  const s = String(input || '').trim().toLowerCase()
  if (!s) return null
  if (s === 'sent' || s === 'delivered' || s === 'read' || s === 'failed') return s
  return null
}

export function tryParseWebhookTimestampSeconds(ts: unknown): { iso: string | null; raw: string | null } {
  if (ts == null) return { iso: null, raw: null }
  const raw = String(ts)
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return { iso: null, raw }
  const d = new Date(n * 1000)
  if (Number.isNaN(d.getTime())) return { iso: null, raw }
  return { iso: d.toISOString(), raw }
}

export function buildStatusEventDedupeKey(input: {
  messageId: string
  status: WhatsAppStatus
  eventTsRaw?: string | null
}): string {
  // Use raw timestamp (seconds) for stable idempotency.
  // When missing, still dedupe on messageId+status to avoid infinite duplicates.
  const ts = (input.eventTsRaw || '').trim()
  return `${input.messageId}:${input.status}:${ts}`
}

/**
 * Reconcile de eventos de status pendentes (unmatched/error).
 *
 * Migração QStash→pg_cron (Fase B, 2026-07-05): antes enfileirava um job QStash com
 * delay de 60s pra re-tentar casar eventos. Agora é no-op: os eventos já ficam
 * persistidos em whatsapp_status_events com apply_state != 'applied' (durável), e o
 * relógio (pg_cron → /api/cron/tick → reconcilePendingStatusEvents) os reaplica
 * periodicamente. A assinatura é mantida pra não tocar os call-sites do webhook.
 */
export async function enqueueWebhookStatusReconcileBestEffort(_reason: string): Promise<void> {
  // Nada a enfileirar — o reconcile é feito pelo cron tick.
}

export async function recordStatusEvent(params: {
  messageId: string
  status: WhatsAppStatus
  eventTsIso: string | null
  eventTsRaw: string | null
  recipientId?: string | null
  errors?: any
  payload?: any
}): Promise<{ id: string | null }> {
  const dedupeKey = buildStatusEventDedupeKey({
    messageId: params.messageId,
    status: params.status,
    eventTsRaw: params.eventTsRaw,
  })

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('whatsapp_status_events')
    .upsert(
      {
        message_id: params.messageId,
        status: params.status,
        event_ts: params.eventTsIso,
        event_ts_raw: params.eventTsRaw,
        dedupe_key: dedupeKey,
        recipient_id: params.recipientId || null,
        errors: params.errors ?? null,
        payload: params.payload ?? null,
        last_received_at: now,
      },
      { onConflict: 'dedupe_key' }
    )
    .select('id')
    .limit(1)

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : (data as any)
  return { id: (row?.id as string) || null }
}

export async function markEventAttempt(params: {
  eventId: string
  state: 'pending' | 'applied' | 'unmatched' | 'error'
  campaignId?: string | null
  campaignContactId?: string | null
  error?: string | null
}) {
  const now = new Date().toISOString()
  const applied = params.state === 'applied'
  const patch: any = {
    apply_state: params.state,
    applied,
    applied_at: applied ? now : null,
    apply_error: params.error || null,
    last_attempt_at: now,
    last_received_at: now,
    ...(params.campaignId ? { campaign_id: params.campaignId } : {}),
    ...(params.campaignContactId ? { campaign_contact_id: params.campaignContactId } : {}),
  }

  // increment attempts best-effort without a dedicated RPC
  // (this is not strictly necessary for correctness)
  try {
    const { data: existing } = await supabase
      .from('whatsapp_status_events')
      .select('attempts')
      .eq('id', params.eventId)
      .limit(1)

    const attempts = (Array.isArray(existing) ? existing[0]?.attempts : (existing as any)?.attempts) ?? 0
    patch.attempts = Number(attempts) + 1
  } catch {
    // ignore
  }

  await supabase.from('whatsapp_status_events').update(patch).eq('id', params.eventId)
}

export async function applyStatusUpdateToCampaignContact(input: {
  messageId: string
  status: WhatsAppStatus
  eventTsIso: string | null
  errors?: any
}): Promise<
  {
    applied: boolean
    reason: 'applied' | 'unmatched' | 'noop'
    campaignId?: string
    campaignContactId?: string
    traceId?: string | null
    phone?: string | null
  } & Record<string, any>
> {
  // Use a non-throwing query to avoid the `.single()` footgun.
  const { data: rows, error } = await supabase
    .from('campaign_contacts')
    .select('id, status, campaign_id, phone, trace_id, delivered_at')
    .eq('message_id', input.messageId)
    .limit(1)

  if (error) throw error
  const existing = Array.isArray(rows) ? rows[0] : (rows as any)
  if (!existing) {
    return { applied: false, reason: 'unmatched' }
  }

  const campaignId = existing.campaign_id as string
  const traceId = (existing as any)?.trace_id ?? null
  const phone = (existing as any)?.phone ?? null

  const statusOrder: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 }
  const currentOrder = statusOrder[String(existing.status || 'pending')] ?? 0
  const newOrder = statusOrder[input.status] ?? 0

  // Skip if not advancing (except failed)
  if (newOrder <= currentOrder && input.status !== 'failed') {
    return { applied: false, reason: 'noop', campaignId, campaignContactId: existing.id, traceId, phone }
  }

  const ts = input.eventTsIso || new Date().toISOString()

  if (input.status === 'delivered') {
    const { data: updatedRows, error: updateError } = await supabase
      .from('campaign_contacts')
      .update({ status: 'delivered', delivered_at: ts })
      .eq('message_id', input.messageId)
      .neq('status', 'delivered')
      .neq('status', 'read')
      .select('id')

    if (updateError) throw updateError

    if (updatedRows && updatedRows.length > 0) {
      const { error: rpcError } = await supabase.rpc('increment_campaign_stat', {
        campaign_id_input: campaignId,
        field: 'delivered',
      })
      if (rpcError) console.error('Failed to increment delivered count:', rpcError)
      return { applied: true, reason: 'applied', campaignId, campaignContactId: existing.id, traceId, phone }
    }

    return { applied: false, reason: 'noop', campaignId, campaignContactId: existing.id, traceId, phone }
  }

  if (input.status === 'read') {
    const { data: updatedRowsRead, error: updateErrorRead } = await supabase
      .from('campaign_contacts')
      .update({ status: 'read', read_at: ts })
      .eq('message_id', input.messageId)
      .neq('status', 'read')
      .select('id')

    if (updateErrorRead) throw updateErrorRead

    if (updatedRowsRead && updatedRowsRead.length > 0) {
      // Ensure delivered_at exists (best-effort) to keep delivered >= read.
      let shouldIncrementDelivered = false
      try {
        const hadDeliveredAt = Boolean(existing?.delivered_at)
        if (!hadDeliveredAt) {
          const { data: deliveredAtRows, error: deliveredAtErr } = await supabase
            .from('campaign_contacts')
            .update({ delivered_at: ts })
            .eq('message_id', input.messageId)
            .is('delivered_at', null)
            .select('id')
          if (deliveredAtErr) throw deliveredAtErr
          if (deliveredAtRows && deliveredAtRows.length > 0) shouldIncrementDelivered = true
        }
      } catch (e) {
        console.warn('[Webhook] Falha ao garantir delivered_at em evento read (best-effort):', e)
      }

      if (shouldIncrementDelivered) {
        const { error: rpcDeliveredErr } = await supabase.rpc('increment_campaign_stat', {
          campaign_id_input: campaignId,
          field: 'delivered',
        })
        if (rpcDeliveredErr) console.error('Failed to increment delivered count (via read):', rpcDeliveredErr)
      }

      const { error: rpcError } = await supabase.rpc('increment_campaign_stat', {
        campaign_id_input: campaignId,
        field: 'read',
      })
      if (rpcError) console.error('Failed to increment read count:', rpcError)

      return { applied: true, reason: 'applied', campaignId, campaignContactId: existing.id, traceId, phone }
    }

    return { applied: false, reason: 'noop', campaignId, campaignContactId: existing.id, traceId, phone }
  }

  if (input.status === 'failed') {
    const metaError = input.errors?.[0] || null
    const errorCode = metaError?.code || 0
    const errorTitle = metaError?.title || 'Unknown error'
    const metaMessage = metaError?.message || ''
    const metaDetails = metaError?.error_data?.details || ''
    const errorDetails = metaDetails || metaMessage
    const errorHref = metaError?.href || ''

    const { data: updatedRowsFailed, error: updateErrorFailed } = await supabase
      .from('campaign_contacts')
      .update({
        status: 'failed',
        failed_at: ts,
        failure_code: errorCode,
        failure_title: errorTitle,
        failure_details: errorDetails,
        failure_href: errorHref,
      })
      .eq('message_id', input.messageId)
      .neq('status', 'failed')
      .select('id')

    if (updateErrorFailed) throw updateErrorFailed

    if (updatedRowsFailed && updatedRowsFailed.length > 0) {
      const { error: rpcError } = await supabase.rpc('increment_campaign_stat', {
        campaign_id_input: campaignId,
        field: 'failed',
      })
      if (rpcError) console.error('Failed to increment failed count:', rpcError)
      return { applied: true, reason: 'applied', campaignId, campaignContactId: existing.id, traceId, phone }
    }

    return { applied: false, reason: 'noop', campaignId, campaignContactId: existing.id, traceId, phone }
  }

  return { applied: false, reason: 'noop', campaignId, campaignContactId: existing.id, traceId, phone }
}

export async function handleWhatsAppStatusWebhookEvent(params: {
  statusUpdate: WhatsAppWebhookStatusUpdate
  // Optional subset of webhook envelope (for forensics)
  payload?: any
}): Promise<{ stored: boolean; applied: boolean; unmatched: boolean; noop: boolean }>
{
  const messageId = String(params.statusUpdate?.id || '').trim()
  const status = normalizeMetaStatus(params.statusUpdate?.status)
  if (!messageId || !status) {
    return { stored: false, applied: false, unmatched: false, noop: true }
  }

  const { iso: eventTsIso, raw: eventTsRaw } = tryParseWebhookTimestampSeconds(params.statusUpdate?.timestamp)

  // 1) Persist event first (durable inbox).
  // Compat: se a migration ainda não foi aplicada, seguimos sem persistência.
  let eventId: string | null = null
  try {
    const rec = await recordStatusEvent({
      messageId,
      status,
      eventTsIso,
      eventTsRaw,
      recipientId: (params.statusUpdate as any)?.recipient_id || null,
      errors: (params.statusUpdate as any)?.errors ?? null,
      payload: params.payload ?? null,
    })
    eventId = rec.id
  } catch (e: any) {
    const code = String(e?.code || '')
    const msg = String(e?.message || '')
    const m = msg.toLowerCase()
    if (code === '42P01' || (m.includes('whatsapp_status_events') && m.includes('does not exist'))) {
      // Table missing: skip durable storage (rollout compat)
      eventId = null
    } else {
      throw e
    }
  }

  // 2) Try to apply immediately.
  try {
    const result = await applyStatusUpdateToCampaignContact({
      messageId,
      status,
      eventTsIso,
      errors: (params.statusUpdate as any)?.errors ?? null,
    })

    if (eventId) {
      if (result.reason === 'applied') {
        await markEventAttempt({ eventId, state: 'applied', campaignId: result.campaignId, campaignContactId: result.campaignContactId })
        return { stored: true, applied: true, unmatched: false, noop: false }
      }
      if (result.reason === 'unmatched') {
        await markEventAttempt({ eventId, state: 'unmatched', error: 'campaign_contact_not_found' })
        await enqueueWebhookStatusReconcileBestEffort('unmatched_message_id')
        return { stored: true, applied: false, unmatched: true, noop: false }
      }
      await markEventAttempt({ eventId, state: 'pending', campaignId: result.campaignId, campaignContactId: result.campaignContactId })
    }

    return { stored: Boolean(eventId), applied: false, unmatched: result.reason === 'unmatched', noop: result.reason === 'noop' }
  } catch (e) {
    if (eventId) {
      await markEventAttempt({ eventId, state: 'error', error: e instanceof Error ? e.message : String(e) })
      await enqueueWebhookStatusReconcileBestEffort('apply_error')
    }
    throw e
  }
}

export async function reconcilePendingStatusEvents(params?: { limit?: number }) {
  const limit = Math.max(1, Math.min(500, params?.limit ?? 200))

  const { data: events, error } = await supabase
    .from('whatsapp_status_events')
    .select('id,message_id,status,event_ts,event_ts_raw,errors,apply_state')
    .neq('apply_state', 'applied')
    .order('last_received_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  let applied = 0
  let stillUnmatched = 0
  let noop = 0
  let errored = 0

  for (const ev of events || []) {
    const status = normalizeMetaStatus(ev.status)
    if (!status || !ev.message_id) continue
    if (status === 'failed' || status === 'sent') continue

    try {
      const result = await applyStatusUpdateToCampaignContact({
        messageId: ev.message_id,
        status,
        eventTsIso: ev.event_ts ? new Date(ev.event_ts).toISOString() : null,
        errors: ev.errors,
      })

      if (result.reason === 'applied') {
        applied++
        await markEventAttempt({ eventId: ev.id, state: 'applied', campaignId: result.campaignId, campaignContactId: result.campaignContactId })
      } else if (result.reason === 'unmatched') {
        stillUnmatched++
        await markEventAttempt({ eventId: ev.id, state: 'unmatched', error: 'campaign_contact_not_found' })
      } else {
        noop++
        // Keep pending if it was a noop due to already being applied.
        await markEventAttempt({ eventId: ev.id, state: ev.apply_state === 'unmatched' ? 'unmatched' : 'pending' })
      }
    } catch (e) {
      errored++
      await markEventAttempt({ eventId: ev.id, state: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  return { scanned: (events || []).length, applied, stillUnmatched, noop, errored }
}
