/**
 * Push Notifications Service
 *
 * Gerencia envio de notificações push via Web Push API.
 * Requer VAPID keys configuradas em env vars.
 *
 * VAPID = Voluntary Application Server Identification
 * Permite identificar o servidor que envia as notificações
 */

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'

// =============================================================================
// Configuration
// =============================================================================

interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:contato@dispara.app'

  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys não configuradas')
    return null
  }

  return { publicKey, privateKey, subject }
}

function setupWebPush(): boolean {
  const config = getVapidConfig()
  if (!config) return false

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  return true
}

// =============================================================================
// Types
// =============================================================================

export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: Record<string, unknown>
  actions?: Array<{ action: string; title: string }>
}

export interface PushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

interface StoredPushSubscription extends PushSubscriptionData {
  attendant_token_id: string | null
}

interface AttendantTokenStatus {
  id: unknown
  is_active: unknown
  expires_at: unknown
  permissions: unknown
}

// =============================================================================
// Destinatários
// =============================================================================

/** Mesma normalização de lib/attendant-auth.ts: só `canView === true` vale. */
function canViewConversations(permissions: unknown): boolean {
  return !!permissions && typeof permissions === 'object' && (permissions as { canView?: unknown }).canView === true
}

function isAttendantTokenDeliverable(token: AttendantTokenStatus, now: number): boolean {
  if (token.is_active !== true) return false
  // O push leva nome do contato e prévia da mensagem: sem canView, o atendente não
  // pode ver isso na PWA (GET /api/attendant/conversations → 403), então não recebe.
  if (!canViewConversations(token.permissions)) return false
  if (!token.expires_at) return true
  const expiresAt = new Date(String(token.expires_at)).getTime()
  return Number.isNaN(expiresAt) || expiresAt > now
}

/**
 * Subscriptions que podem receber push agora:
 * - do dono (attendant_token_id NULL): sempre;
 * - de atendente: só com o token ativo, não expirado e com permissão de visualizar
 *   (canView). Atendente desativado, expirado, removido ou que perdeu o canView não
 *   recebe mais nome do contato nem prévia da mensagem.
 * Se não der para checar os tokens (erro de banco), envia só para o dono (fail-closed).
 */
export async function loadDeliverablePushSubscriptions(supabase: SupabaseClient): Promise<PushSubscriptionData[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, keys, attendant_token_id')

  if (error) {
    console.error('[Push] Erro ao carregar subscriptions:', error.message)
    return []
  }

  const rows = (data ?? []) as StoredPushSubscription[]
  const attendantIds = [
    ...new Set(rows.map((row) => row.attendant_token_id).filter((id): id is string => !!id)),
  ]

  const deliverableAttendantIds = new Set<string>()
  if (attendantIds.length > 0) {
    const { data: tokens, error: tokensError } = await supabase
      .from('attendant_tokens')
      .select('id, is_active, expires_at, permissions')
      .in('id', attendantIds)

    if (tokensError) {
      console.error('[Push] Erro ao checar atendentes; enviando só para o dono:', tokensError.message)
    } else {
      const now = Date.now()
      for (const token of (tokens ?? []) as AttendantTokenStatus[]) {
        if (isAttendantTokenDeliverable(token, now)) deliverableAttendantIds.add(String(token.id))
      }
    }
  }

  return rows
    .filter((row) => !row.attendant_token_id || deliverableAttendantIds.has(row.attendant_token_id))
    .map(({ endpoint, keys }) => ({ endpoint, keys }))
}

// =============================================================================
// Push Functions
// =============================================================================

/**
 * Envia notificação para uma subscription específica
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  if (!setupWebPush()) {
    return { success: false, error: 'VAPID não configurado' }
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    )

    return { success: true }
  } catch (error) {
    const err = error as Error & { statusCode?: number }

    // Se subscription expirou ou foi invalidada, remover do banco
    if (err.statusCode === 410 || err.statusCode === 404) {
      await removeInvalidSubscription(subscription.endpoint)
      return { success: false, error: 'Subscription expirada' }
    }

    console.error('[Push] Erro ao enviar:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Envia notificação para todas as subscriptions ativas
 * (dono + atendentes com token ativo e canView; ver loadDeliverablePushSubscriptions)
 */
export async function broadcastPushNotification(
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!setupWebPush()) {
    return { sent: 0, failed: 0 }
  }

  const supabase = await createClient()
  const subscriptions = await loadDeliverablePushSubscriptions(supabase)

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendPushNotification(sub, payload)
    )
  )

  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value.success) {
      sent++
    } else {
      failed++
    }
  })

  return { sent, failed }
}

/**
 * Envia notificação de nova mensagem
 */
export async function sendNewMessageNotification(
  contactName: string,
  preview: string,
  conversationId: string
): Promise<{ sent: number; failed: number }> {
  return broadcastPushNotification({
    title: contactName,
    body: preview.slice(0, 100),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `conversation-${conversationId}`,
    data: {
      url: `/atendimento?conversation=${conversationId}`,
      conversationId,
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
  })
}

/**
 * Remove subscription inválida do banco
 */
async function removeInvalidSubscription(endpoint: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    console.log('[Push] Subscription inválida removida:', endpoint.slice(0, 50))
  } catch (error) {
    console.error('[Push] Erro ao remover subscription inválida:', error)
  }
}

// =============================================================================
// VAPID Key Generation (use once to generate keys)
// =============================================================================

/**
 * Gera par de chaves VAPID.
 * Execute uma vez e salve as chaves em variáveis de ambiente.
 *
 * @example
 * const keys = generateVapidKeys()
 * // Adicione ao .env:
 * // NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
 * // VAPID_PRIVATE_KEY=...
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys()
}
