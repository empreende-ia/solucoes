import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'

/**
 * Defesa em profundidade do webhook da Meta: compara `entry[].id` (WABA) e
 * `value.metadata.phone_number_id` com as credenciais configuradas e LOGA as
 * divergências. Não descarta nada (ainda), de propósito:
 * - WABA ID e phone_number_id NÃO são segredos (aparecem em logs, em payloads
 *   repassados ao externalWebhookUrl, em suporte): barrar por eles não protege de
 *   quem quer forjar — quem fecha o buraco é o App Secret (assinatura verificada);
 * - descartar quebraria casos legítimos: números adicionais do mesmo WABA, troca de
 *   número antes de as credenciais serem atualizadas, vários WABAs no mesmo App.
 * O log serve para medir esses casos antes de qualquer descarte.
 */

export type WebhookOriginField = 'entry.id' | 'metadata.phone_number_id'

export interface WebhookOriginMismatch {
  field: WebhookOriginField
  received: string
  expected: string
}

export interface WebhookOriginExpected {
  businessAccountId?: string | null
  phoneNumberId?: string | null
}

const CREDENTIALS_CACHE_TTL_MS = 60_000
const MISMATCH_LOG_INTERVAL_MS = 10 * 60_000
const MISMATCH_LOG_MAX_KEYS = 200

let credentialsCache: { value: WebhookOriginExpected | null; expiresAt: number } | null = null
const lastLoggedAt = new Map<string, number>()

/** Zera o estado em memória (testes). */
export function resetWebhookOriginState(): void {
  credentialsCache = null
  lastLoggedAt.clear()
}

function asId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/** Função pura: lista as divergências entre o payload e os IDs configurados. */
export function findWebhookOriginMismatches(body: unknown, expected: WebhookOriginExpected): WebhookOriginMismatch[] {
  const waba = asId(expected.businessAccountId)
  const phone = asId(expected.phoneNumberId)
  if (!waba && !phone) return []

  const entries = (body as { entry?: unknown } | null)?.entry
  if (!Array.isArray(entries)) return []

  const out: WebhookOriginMismatch[] = []
  const seen = new Set<string>()
  const push = (m: WebhookOriginMismatch) => {
    const key = `${m.field}:${m.received}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(m)
  }

  for (const entry of entries) {
    const entryId = asId((entry as { id?: unknown } | null)?.id)
    if (waba && entryId && entryId !== waba) push({ field: 'entry.id', received: entryId, expected: waba })

    const changes = (entry as { changes?: unknown } | null)?.changes
    if (!Array.isArray(changes)) continue
    for (const change of changes) {
      const received = asId(
        (change as { value?: { metadata?: { phone_number_id?: unknown } } } | null)?.value?.metadata?.phone_number_id
      )
      if (phone && received && received !== phone) {
        push({ field: 'metadata.phone_number_id', received, expected: phone })
      }
    }
  }
  return out
}

function maskId(id: string): string {
  return id.length <= 6 ? id : `${id.slice(0, 3)}…${id.slice(-3)}`
}

async function getExpectedIds(): Promise<WebhookOriginExpected | null> {
  const now = Date.now()
  if (credentialsCache && credentialsCache.expiresAt > now) return credentialsCache.value
  const creds = await getWhatsAppCredentials().catch(() => null)
  const value = creds ? { businessAccountId: creds.businessAccountId, phoneNumberId: creds.phoneNumberId } : null
  credentialsCache = { value, expiresAt: now + CREDENTIALS_CACHE_TTL_MS }
  return value
}

/**
 * Loga (com rate limit por ID recebido) as divergências do payload em relação às
 * credenciais configuradas. Nunca lança e nunca descarta o evento.
 */
export async function logWebhookOriginMismatches(
  body: unknown,
  context: { verified: boolean; mode: string }
): Promise<WebhookOriginMismatch[]> {
  try {
    const expected = await getExpectedIds()
    if (!expected) return []
    const mismatches = findWebhookOriginMismatches(body, expected)
    if (!mismatches.length) return mismatches

    const now = Date.now()
    if (lastLoggedAt.size > MISMATCH_LOG_MAX_KEYS) lastLoggedAt.clear()
    for (const m of mismatches) {
      const key = `${m.field}:${m.received}`
      const last = lastLoggedAt.get(key) || 0
      if (last && now - last < MISMATCH_LOG_INTERVAL_MS) continue
      lastLoggedAt.set(key, now)
      console.warn(
        `[Webhook] ⚠️ ${m.field} do payload (${maskId(m.received)}) difere do configurado (${maskId(m.expected)}). ` +
          `Evento processado mesmo assim (assinatura ${context.verified ? 'verificada' : `NÃO verificada, modo ${context.mode}`}). ` +
          (context.verified
            ? 'Pode ser outro número/WABA do mesmo App.'
            : 'Sem assinatura verificada, pode ser um evento forjado: configure o App Secret em Configurações.')
      )
    }
    return mismatches
  } catch (error) {
    console.warn('[Webhook] Falha ao comparar a origem do payload (ignorado):', error)
    return []
  }
}
