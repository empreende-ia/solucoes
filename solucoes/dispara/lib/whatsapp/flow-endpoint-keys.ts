/**
 * WhatsApp Flow Endpoint - gestão automática das chaves RSA
 *
 * Gerar/regenerar a chave e re-registrar a pública na Meta é uma ação com efeito
 * colateral forte: a Meta passa a cifrar com a chave nova e todos os Flows em
 * andamento recebem 421 até a propagação. Por isso o endpoint só faz isso quando
 * a request tem assinatura X-Hub-Signature-256 VERIFICADA (prova de que veio da
 * Meta). Sem assinatura verificada qualquer um consegue mandar lixo, então nunca
 * há regeneração automática — o dono gera as chaves em Configurações.
 *
 * Sem assinatura verificada o endpoint ainda pode RE-SINCRONIZAR: comparar a chave
 * pública registrada na Meta com a derivada da nossa chave privada e, se forem
 * diferentes, registrar de novo a NOSSA chave existente. É idempotente, quem chama
 * não escolhe a chave e nada local muda — lixo anônimo provoca no máximo um GET e
 * um SET na Graph por cooldown (que fica numa setting própria, para não atrasar
 * uma regeneração legítima). A janela do cooldown é REIVINDICADA de forma atômica
 * no banco (vale entre instâncias) e há single-flight por instância: uma rajada
 * concorrente não multiplica as chamadas (ver resyncFlowPublicKeyIfDue).
 */

import { createPublicKey } from 'node:crypto'
import { settingsDb } from '@/lib/supabase-db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateKeyPair } from '@/lib/whatsapp/flow-endpoint-crypto'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { metaGetEncryptionPublicKey, metaSetEncryptionPublicKey } from '@/lib/meta-flows-api'
import {
  createMetaIntegrationAlert,
  dismissMetaIntegrationAlerts,
} from '@/lib/meta-integration-alerts'

export const FLOW_PRIVATE_KEY_SETTING = 'whatsapp_flow_private_key'
export const FLOW_PUBLIC_KEY_SETTING = 'whatsapp_flow_public_key'
export const FLOW_LAST_KEY_REGEN_SETTING = 'whatsapp_flow_last_key_regen'
export const FLOW_LAST_KEY_RESYNC_SETTING = 'whatsapp_flow_last_key_resync'

// Cooldown de 10 minutos entre regenerações de chave
export const FLOW_KEY_REGEN_COOLDOWN_MS = 10 * 60 * 1000
// Cooldown de 10 minutos entre re-sincronizações sem assinatura verificada
export const FLOW_KEY_RESYNC_COOLDOWN_MS = 10 * 60 * 1000

export const FLOW_KEYS_ALERT_ID_PREFIX = 'alert_meta_flow_keys_'
const MISSING_KEY_ALERT_MIN_FAILURES = 3
const DECRYPT_FAILURE_WINDOW_MS = 30 * 60_000
const DECRYPT_FAILURE_MAX_EVENTS = 200
const FLOW_ALERT_LOCAL_THROTTLE_MS = 10 * 60_000
// A Meta espera a resposta do endpoint em ~10s: chamadas à Graph aqui têm teto próprio.
const GRAPH_CALL_TIMEOUT_MS = 4000

export type FlowKeyRecoveryDecision =
  | 'regenerate'      // assinatura verificada, chave ausente/trocada, fora do cooldown
  | 'resync'          // sem assinatura verificada + OAEP: só re-registra a chave LOCAL existente
  | 'cooldown'        // regenerou/re-sincronizou há pouco; espera a Meta propagar a chave
  | 'unverified'      // assinatura não verificada e chave ausente: nunca gera
  | 'not_applicable'  // erro de decifração que não indica chave trocada

/**
 * - missing_key: não há chave privada salva (ou a leitura do banco falhou — por
 *   isso o cooldown também vale aqui, para não sobrescrever a chave boa em loop);
 * - oaep_error: a AES key não abre com a nossa chave privada (a Meta usa outra pública);
 * - other_error: qualquer outra falha de decifração (não regenera).
 */
export type FlowKeyRecoveryTrigger = 'missing_key' | 'oaep_error' | 'other_error'

export function isOaepDecryptError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('oaep') || message.includes('OAEP')
}

export function decideFlowKeyRecovery(params: {
  signatureVerified: boolean
  trigger: FlowKeyRecoveryTrigger
  lastRegenAt: number
  /**
   * Só usado sem assinatura verificada (cooldown próprio da re-sincronização). O
   * endpoint não passa: lá a janela é reivindicada de forma atômica em
   * resyncFlowPublicKeyIfDue (ler e depois gravar deixava uma rajada passar).
   */
  lastResyncAt?: number
  now: number
}): FlowKeyRecoveryDecision {
  if (params.trigger === 'other_error') return 'not_applicable'
  if (!params.signatureVerified) {
    // Falha de leitura do banco também cai em missing_key: nunca vira chave nova.
    if (params.trigger === 'missing_key') return 'unverified'
    const lastResyncAt = Number.isFinite(params.lastResyncAt) ? Number(params.lastResyncAt) : 0
    if (params.now - lastResyncAt < FLOW_KEY_RESYNC_COOLDOWN_MS) return 'cooldown'
    return 'resync'
  }
  const lastRegenAt = Number.isFinite(params.lastRegenAt) ? params.lastRegenAt : 0
  if (params.now - lastRegenAt < FLOW_KEY_REGEN_COOLDOWN_MS) return 'cooldown'
  return 'regenerate'
}

async function readTimestampSetting(key: string): Promise<number> {
  const raw = await settingsDb.get(key)
  const parsed = raw ? parseInt(raw, 10) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getLastFlowKeyRegenAt(): Promise<number> {
  return readTimestampSetting(FLOW_LAST_KEY_REGEN_SETTING)
}

export async function getLastFlowKeyResyncAt(): Promise<number> {
  return readTimestampSetting(FLOW_LAST_KEY_RESYNC_SETTING)
}

/**
 * Gera um novo par RSA, salva nas settings (com o timestamp do cooldown) e tenta
 * registrar a chave pública na Meta (best-effort).
 */
export async function rotateFlowEndpointKeys(now: number = Date.now()): Promise<{ metaSynced: boolean }> {
  const { publicKey, privateKey } = generateKeyPair()

  await Promise.all([
    settingsDb.set(FLOW_PRIVATE_KEY_SETTING, privateKey),
    settingsDb.set(FLOW_PUBLIC_KEY_SETTING, publicKey),
    settingsDb.set(FLOW_LAST_KEY_REGEN_SETTING, String(now)),
  ])
  console.log('[flow-endpoint] ✅ Novas chaves RSA geradas')

  try {
    const credentials = await getWhatsAppCredentials()
    if (credentials?.accessToken && credentials?.phoneNumberId) {
      await metaSetEncryptionPublicKey({
        accessToken: credentials.accessToken,
        phoneNumberId: credentials.phoneNumberId,
        publicKey,
      })
      console.log('[flow-endpoint] ✅ Nova chave pública sincronizada com a Meta')
      console.log('[flow-endpoint] 💡 A Meta pode levar até 5-10min para propagar a nova chave')
      return { metaSynced: true }
    }
    console.error('[flow-endpoint] ⚠️ Credenciais WhatsApp não configuradas, sincronização com a Meta pendente')
  } catch (syncError) {
    console.error('[flow-endpoint] ⚠️ Falha ao sincronizar chave com a Meta (não-bloqueante):', syncError)
  }
  return { metaSynced: false }
}

// ---------------------------------------------------------------------------
// Comparação/re-sincronização da chave pública com a Meta
// ---------------------------------------------------------------------------

/** Chave pública (SPKI PEM) derivada da privada: é a que de fato decifra. */
export function derivePublicKeyPem(privateKeyPem: string): string {
  return createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString()
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout de ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function normalizePem(pem: string): string {
  return pem.trim().replace(/\r\n/g, '\n')
}

/** Compara o material da chave (DER), não o texto: formatação diferente não é divergência. */
export function isSamePublicKey(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  try {
    const derA = createPublicKey(a).export({ type: 'spki', format: 'der' })
    const derB = createPublicKey(b).export({ type: 'spki', format: 'der' })
    return Buffer.compare(derA, derB) === 0
  } catch {
    return normalizePem(a) === normalizePem(b)
  }
}

export type FlowPublicKeyInspection =
  | { status: 'in_sync' }
  | { status: 'mismatch'; metaHasKey: boolean }
  | { status: 'missing_local_key' }
  | { status: 'invalid_local_key' }
  | { status: 'no_credentials' }
  | { status: 'failed'; error: string }

interface InspectionContext {
  inspection: FlowPublicKeyInspection
  localPublicKey?: string
  credentials?: { accessToken: string; phoneNumberId: string }
}

async function inspect(privateKeyOverride?: string | null): Promise<InspectionContext> {
  const privateKey = privateKeyOverride ?? (await settingsDb.get(FLOW_PRIVATE_KEY_SETTING))
  if (!privateKey) return { inspection: { status: 'missing_local_key' } }

  let localPublicKey: string
  try {
    localPublicKey = derivePublicKeyPem(privateKey)
  } catch {
    return { inspection: { status: 'invalid_local_key' } }
  }

  const credentials = await getWhatsAppCredentials()
  if (!credentials?.accessToken || !credentials?.phoneNumberId) {
    return { inspection: { status: 'no_credentials' }, localPublicKey }
  }
  const creds = { accessToken: credentials.accessToken, phoneNumberId: credentials.phoneNumberId }

  try {
    const registered = await withTimeout(
      metaGetEncryptionPublicKey(creds),
      GRAPH_CALL_TIMEOUT_MS,
      'Consulta da chave pública na Meta'
    )
    if (isSamePublicKey(registered.publicKey, localPublicKey)) {
      return { inspection: { status: 'in_sync' }, localPublicKey, credentials: creds }
    }
    return {
      inspection: { status: 'mismatch', metaHasKey: Boolean(registered.publicKey) },
      localPublicKey,
      credentials: creds,
    }
  } catch (error) {
    return {
      inspection: { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      localPublicKey,
    }
  }
}

/** Só leitura: a chave registrada na Meta é a derivada da nossa chave privada? */
export async function inspectFlowPublicKey(params?: { privateKey?: string | null }): Promise<FlowPublicKeyInspection> {
  return (await inspect(params?.privateKey)).inspection
}

export type FlowKeySyncResult =
  | { status: 'in_sync' }
  | { status: 'resynced' }
  | { status: 'missing_local_key' }
  | { status: 'invalid_local_key' }
  | { status: 'no_credentials' }
  | { status: 'failed'; error: string }

/**
 * Garante que a Meta tem a chave pública da NOSSA chave privada: compara e só
 * registra se divergir. Nunca gera par novo nem altera as chaves locais.
 */
export async function syncFlowPublicKeyWithMeta(params?: { privateKey?: string | null }): Promise<FlowKeySyncResult> {
  const { inspection, localPublicKey, credentials } = await inspect(params?.privateKey)
  if (inspection.status !== 'mismatch') return inspection
  if (!localPublicKey || !credentials) return { status: 'failed', error: 'Contexto incompleto para sincronizar' }

  try {
    await withTimeout(
      metaSetEncryptionPublicKey({ ...credentials, publicKey: localPublicKey }),
      GRAPH_CALL_TIMEOUT_MS,
      'Registro da chave pública na Meta'
    )
    console.log('[flow-endpoint] 🔄 Chave pública local re-registrada na Meta (a registrada era diferente).')
    return { status: 'resynced' }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

// ---------------------------------------------------------------------------
// Re-sincronização disparada por request NÃO verificada (cooldown atômico)
// ---------------------------------------------------------------------------

/**
 * Reivindica a janela de re-sincronização sem assinatura verificada: no máximo uma
 * por cooldown, inclusive entre instâncias serverless. Ler o timestamp e só depois
 * gravá-lo (check-then-act) deixava uma rajada concorrente inteira passar — N
 * requests lixo viravam N GETs (e SETs) na Graph com o token do WABA.
 *
 * Quem reivindica é um UPDATE condicional (uma instrução só): com requests
 * concorrentes o Postgres serializa no lock da linha e reavalia o WHERE, então só
 * uma recebe a linha de volta. O valor é epoch em ms (13 dígitos até o ano 2286):
 * com largura fixa a comparação de texto da coluna `value` equivale à numérica;
 * '0'/vazio = nunca re-sincronizou.
 *
 * Fail-closed: erro do banco conta como cooldown (nunca libera a Graph).
 */
export async function claimFlowKeyResync(now: number = Date.now()): Promise<boolean> {
  try {
    const db = getSupabaseAdmin()
    if (!db) return false

    // Curto-circuito barato: dentro do cooldown, a rajada só faz SELECT (não escreve).
    const { data: row, error: readError } = await db
      .from('settings')
      .select('value')
      .eq('key', FLOW_LAST_KEY_RESYNC_SETTING)
      .maybeSingle()
    if (readError) throw readError
    const last = parseInt(String((row as { value?: unknown } | null)?.value ?? ''), 10)
    if (Number.isFinite(last) && now - last < FLOW_KEY_RESYNC_COOLDOWN_MS) return false

    const updatedAt = new Date(now).toISOString()
    if (!row) {
      // Primeira vez: cria a linha "nunca re-sincronizou" sem sobrescrever uma criada
      // em paralelo (ON CONFLICT DO NOTHING). Quem reivindica é o UPDATE abaixo.
      const { error: seedError } = await db
        .from('settings')
        .upsert(
          { key: FLOW_LAST_KEY_RESYNC_SETTING, value: '0', updated_at: updatedAt },
          { onConflict: 'key', ignoreDuplicates: true }
        )
      if (seedError) throw seedError
    }

    // value <= now - cooldown (escrito como < ... + 1): mesma fronteira da decisão.
    const { data: claimed, error: claimError } = await db
      .from('settings')
      .update({ value: String(now), updated_at: updatedAt })
      .eq('key', FLOW_LAST_KEY_RESYNC_SETTING)
      .lt('value', String(now - FLOW_KEY_RESYNC_COOLDOWN_MS + 1))
      .select('key')
    if (claimError) throw claimError
    return Array.isArray(claimed) && claimed.length > 0
  } catch (error) {
    console.warn('[flow-endpoint] Falha ao reivindicar a re-sincronização da chave (tratada como cooldown):', error)
    return false
  }
}

let resyncInFlight = false

export type FlowKeyResyncAttempt =
  | { claimed: false }
  | { claimed: true; result: FlowKeySyncResult }

/**
 * Re-sincroniza a chave pública com a Meta a partir de uma request NÃO verificada,
 * no máximo uma vez por cooldown: uma por vez nesta instância (as concorrentes
 * respondem na hora, sem esperar a Graph nem ir ao banco) e uma por janela entre
 * instâncias (claimFlowKeyResync). `claimed: false` = cooldown.
 */
export async function resyncFlowPublicKeyIfDue(params: {
  privateKey: string | null
  now?: number
}): Promise<FlowKeyResyncAttempt> {
  if (resyncInFlight) return { claimed: false }
  resyncInFlight = true
  try {
    if (!(await claimFlowKeyResync(params.now ?? Date.now()))) return { claimed: false }
    return { claimed: true, result: await syncFlowPublicKeyWithMeta({ privateKey: params.privateKey }) }
  } finally {
    resyncInFlight = false
  }
}

// ---------------------------------------------------------------------------
// Falhas de decifração: estatística (diagnóstico) e alerta ao dono
// ---------------------------------------------------------------------------

/**
 * Situação da chave quando a decifração falhou:
 * - missing_key: não há chave privada local;
 * - in_sync: a Meta tem a nossa chave — a falha não é de chave nossa (lixo/forja ou
 *   cache do cliente, que o 421 resolve); não alerta;
 * - resynced: a Meta tinha outra chave e a nossa foi re-registrada; não alerta;
 * - regenerated: assinatura verificada, par novo gerado e registrado; não alerta;
 * - unconfirmed: não deu para conferir/registrar a chave na Meta; alerta;
 * - pending: dentro do cooldown, sem resultado novo; só estatística.
 */
export type FlowDecryptKeyStatus =
  | 'missing_key'
  | 'in_sync'
  | 'resynced'
  | 'regenerated'
  | 'unconfirmed'
  | 'pending'

interface DecryptFailureEvent {
  at: number
  trigger: FlowKeyRecoveryTrigger
  keyStatus: FlowDecryptKeyStatus
  signatureVerified: boolean
}

let decryptFailures: DecryptFailureEvent[] = []
let lastFlowAlertAt = 0

/** Zera o estado em memória (testes). */
export function resetFlowKeyAlertState(): void {
  decryptFailures = []
  lastFlowAlertAt = 0
  resyncInFlight = false
}

function pruneDecryptFailures(now: number): void {
  const cutoff = now - DECRYPT_FAILURE_WINDOW_MS
  if (decryptFailures.length && decryptFailures[0].at < cutoff) {
    decryptFailures = decryptFailures.filter((e) => e.at >= cutoff)
  }
  if (decryptFailures.length > DECRYPT_FAILURE_MAX_EVENTS) {
    decryptFailures = decryptFailures.slice(-DECRYPT_FAILURE_MAX_EVENTS)
  }
}

export interface FlowDecryptFailureSummary {
  scope: 'instance'
  windowMinutes: number
  total: number
  /** Falhas em requests com assinatura VERIFICADA (as demais podem ser ruído de terceiros). */
  verifiedTotal: number
  byKeyStatus: Partial<Record<FlowDecryptKeyStatus, number>>
  lastAt: string | null
  lastKeyStatus: FlowDecryptKeyStatus | null
}

export function getFlowDecryptFailureSummary(now: number = Date.now()): FlowDecryptFailureSummary {
  pruneDecryptFailures(now)
  const byKeyStatus: Partial<Record<FlowDecryptKeyStatus, number>> = {}
  for (const e of decryptFailures) byKeyStatus[e.keyStatus] = (byKeyStatus[e.keyStatus] || 0) + 1
  const last = decryptFailures[decryptFailures.length - 1] || null
  return {
    scope: 'instance',
    windowMinutes: DECRYPT_FAILURE_WINDOW_MS / 60_000,
    total: decryptFailures.length,
    verifiedTotal: decryptFailures.filter((e) => e.signatureVerified).length,
    byKeyStatus,
    lastAt: last ? new Date(last.at).toISOString() : null,
    lastKeyStatus: last?.keyStatus ?? null,
  }
}

export const FLOW_KEYS_RECOMMENDED_ACTION =
  'Abra Configurações > Diagnóstico da Meta e use "Re-sincronizar chave dos Flows" (ou gere novas chaves em Configurações > MiniApp Dinâmico, no modo desenvolvedor). ' +
  'Se você não usa MiniApps (Flows) com endpoint, pode dispensar este aviso.'

/**
 * Registra uma falha de decifração no endpoint de Flows e, quando ela indica um
 * problema real de chave (ausente em requests com assinatura verificada, ou não deu
 * para conferir/registrar na Meta), cria um account_alert deduplicado (type
 * 'meta_integration'). Best-effort.
 */
export async function reportFlowDecryptFailure(params: {
  trigger: FlowKeyRecoveryTrigger
  keyStatus: FlowDecryptKeyStatus
  signatureVerified: boolean
  now?: number
}): Promise<void> {
  if (params.trigger === 'other_error') return
  const now = params.now ?? Date.now()
  decryptFailures.push({
    at: now,
    trigger: params.trigger,
    keyStatus: params.keyStatus,
    signatureVerified: params.signatureVerified,
  })
  pruneDecryptFailures(now)

  let alertWorthy = false
  let count = 0
  if (params.keyStatus === 'unconfirmed') {
    alertWorthy = true
    count = decryptFailures.filter((e) => e.keyStatus === 'unconfirmed').length
  } else if (params.keyStatus === 'missing_key') {
    // Sem prova de origem, "chave ausente" pode ser só lixo anônimo (3 POSTs sem
    // assinatura acendiam o banner, e ele voltava a cada hora). E como a instalação
    // sempre cria a chave, ela só falta se o dono a apagou. Então só requests com
    // assinatura VERIFICADA contam para o alerta; as outras ficam na estatística.
    if (!params.signatureVerified) return
    count = decryptFailures.filter((e) => e.keyStatus === 'missing_key' && e.signatureVerified).length
    alertWorthy = count >= MISSING_KEY_ALERT_MIN_FAILURES
  }
  if (!alertWorthy) return

  if (lastFlowAlertAt && now - lastFlowAlertAt < FLOW_ALERT_LOCAL_THROTTLE_MS) return
  lastFlowAlertAt = now

  const unsignedHint = params.signatureVerified
    ? ''
    : ' Configure também o App Secret do App da Meta em Configurações: com a assinatura verificada, o endpoint consegue gerar e registrar chaves sozinho.'
  const message =
    params.keyStatus === 'missing_key'
      ? `O endpoint de Flows (MiniApp Dinâmico) recebeu ${count} requisição(ões) recente(s), mas não há chave privada configurada para decifrá-las.`
      : 'O endpoint de Flows (MiniApp Dinâmico) não conseguiu decifrar requisições recentes e não foi possível conferir/registrar a chave pública na Meta.'

  await createMetaIntegrationAlert({
    idPrefix: FLOW_KEYS_ALERT_ID_PREFIX,
    message,
    action: FLOW_KEYS_RECOMMENDED_ACTION + unsignedHint,
    details: {
      kind: 'flow_keys',
      keyStatus: params.keyStatus,
      trigger: params.trigger,
      signatureVerified: params.signatureVerified,
      count,
    },
    now,
  })
}

/** Chaves confirmadas/consertadas pelo dono: os avisos de chave deixam de valer. */
export async function dismissFlowKeyAlerts(): Promise<void> {
  decryptFailures = decryptFailures.filter((e) => e.keyStatus !== 'unconfirmed' && e.keyStatus !== 'missing_key')
  await dismissMetaIntegrationAlerts(FLOW_KEYS_ALERT_ID_PREFIX)
}
