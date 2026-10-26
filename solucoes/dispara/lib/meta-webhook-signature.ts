import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  getStoredMetaAppSecretState,
  hashMetaAppSecret,
  markStoredMetaAppSecretVerified,
} from '@/lib/meta-app-credentials'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  createMetaIntegrationAlert,
  dismissMetaIntegrationAlerts,
  listRecentMetaIntegrationAlerts,
  resolveMetaIntegrationAlerts,
  type MetaIntegrationAlertSummary,
} from '@/lib/meta-integration-alerts'

/**
 * Verificação da assinatura X-Hub-Signature-256 da Meta (webhook do WhatsApp e
 * endpoint de data exchange dos WhatsApp Flows).
 *
 * Política (evaluateMetaSignature):
 * - App Secret na env META_APP_SECRET (ou META_WEBHOOK_REQUIRE_SIGNATURE=true)
 *   → exige assinatura válida desde o início (fail-closed), modo 'enforced'.
 * - App Secret salvo pela UI (settings 'metaAppSecret') → começa em 'report_only':
 *   o HMAC é conferido, mas uma divergência é aceita, logada e alertada (é o mesmo
 *   comportamento de antes, quando o secret de settings não era usado no webhook).
 *   Na PRIMEIRA assinatura válida grava o sha256 do secret comprovado
 *   (settings 'metaAppSecretVerifiedHash'/'metaAppSecretVerifiedAt') e passa a
 *   'enforced'. Trocar/apagar o secret pela UI zera a verificação. Motivo: um secret
 *   errado já salvo (Client Token colado no lugar, secret de outro App, secret
 *   antigo depois de "Reset App Secret") não pode derrubar todo o inbound e os Flows
 *   no deploy. Um atacante não consegue promover para 'enforced' sem o secret.
 * - NÃO há App Secret → aceita sem assinatura (modo 'unsigned_allowed') e loga um
 *   warning periódico. O App Secret é OPCIONAL no produto e o installer não o
 *   provisiona: fail-closed incondicional derrubaria o inbound de toda instalação
 *   sem secret. Exceção: META_WEBHOOK_REQUIRE_SIGNATURE=true rejeita mesmo assim.
 * - Não deu para ler o App Secret (falha de banco) → rejeita (nunca "abre" por erro).
 */

export const META_SIGNATURE_HEADER = 'x-hub-signature-256'

export type MetaAppSecretSource = 'env' | 'settings' | null

export interface MetaAppSecretInfo {
  secret: string | null
  source: MetaAppSecretSource
  /** Só para source 'settings': o secret atual já foi comprovado por uma assinatura válida. */
  verified: boolean
  verifiedAt: string | null
}

export type MetaSignatureMode = 'enforced' | 'report_only' | 'unsigned_allowed'

export type MetaSignatureReason =
  | 'missing_signature'   // header ausente
  | 'malformed_signature' // header fora do formato sha256=<64 hex>
  | 'invalid_signature'   // HMAC não confere
  | 'app_secret_required' // META_WEBHOOK_REQUIRE_SIGNATURE=true sem App Secret configurado
  | 'secret_unavailable'  // falha ao ler o App Secret (banco) — fail-closed
  | 'no_app_secret'       // unsigned_allowed: aceito sem verificação

export interface MetaSignatureEvaluation {
  /** A request pode seguir para o processamento. */
  ok: boolean
  mode: MetaSignatureMode
  /** O HMAC conferiu: prova de que a request veio da Meta. */
  verified: boolean
  /** Por que NÃO foi verificada (ausente quando verified). */
  reason?: MetaSignatureReason
}

export type MetaSignatureEndpoint = 'webhook' | 'flows_endpoint'

/** Estado da verificação do App Secret, para diagnóstico. */
export type MetaSignatureVerification =
  | 'verified'             // secret de settings comprovado: assinatura exigida
  | 'pending_verification' // secret de settings ainda não comprovado: 'report_only'
  | 'unsigned_allowed'     // sem App Secret: aceita sem assinatura
  | 'not_applicable'       // secret da env (exigido desde o início) ou exige assinatura sem secret

export const META_SIGNATURE_LAST_VALID_AT_SETTING = 'metaSignatureLastValidAt'

const APP_SECRET_CACHE_TTL_MS = 60_000
const UNSIGNED_WARNING_INTERVAL_MS = 15 * 60_000
const REPORT_ONLY_WARNING_INTERVAL_MS = 5 * 60_000
const FAILURE_ALERT_LOCAL_THROTTLE_MS = 10 * 60_000
const FAILURE_STATS_WINDOW_MS = 60 * 60_000
const FAILURE_STATS_MAX_EVENTS = 500
const VERIFY_PERSIST_RETRY_MS = 60_000
const LAST_VALID_PERSIST_INTERVAL_MS = 5 * 60_000
// report_only: nenhuma assinatura válida jamais chegou para este secret, então
// rejeições de HMAC repetidas indicam secret errado (não há tráfego válido a mascarar).
const REPORT_ONLY_ALERT_MIN_FAILURES = 2
const REPORT_ONLY_ALERT_WINDOW_MS = 60 * 60_000
// enforced: só alerta se as rejeições se repetem E nenhuma assinatura válida chegou
// no período. Se a Meta continua entregando com assinatura válida, o secret está
// certo e as rejeições são de terceiros (ruído, não configuração).
const ENFORCED_ALERT_MIN_FAILURES = 5
const ENFORCED_ALERT_WINDOW_MS = 15 * 60_000

export const META_SIGNATURE_ALERT_ID_PREFIX = 'alert_meta_signature_'
/** Alerta único (sem bucket): App Secret ausente. Dispensado uma vez, não volta. */
export const META_APP_SECRET_MISSING_ALERT_ID = 'alert_meta_app_secret_missing'
const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i

export const META_APP_SECRET_RECOMMENDED_ACTION =
  'Configure o App Secret do App da Meta em Configurações (ou na env META_APP_SECRET). ' +
  'Sem ele, qualquer pessoa que conheça a URL do webhook pode forjar eventos (mensagens recebidas, opt-outs, status, respostas de Flows): ' +
  'configurar o App Secret é o que fecha esse buraco.'

export const META_APP_SECRET_PENDING_ACTION =
  'O App Secret salvo em Configurações ainda não foi confirmado por uma requisição assinada da Meta: até lá a assinatura é conferida, mas NÃO exigida. ' +
  'Se há falhas de assinatura recentes, confira se o App Secret é o do mesmo App da Meta que envia o webhook (developers.facebook.com > App > Configurações > Básico).'

interface FailureEvent {
  at: number
  reason: MetaSignatureReason
  endpoint: MetaSignatureEndpoint
  mode: MetaSignatureMode
}

let secretCache: { value: MetaAppSecretInfo; expiresAt: number } | null = null
let secretInflight: Promise<MetaAppSecretInfo> | null = null
let lastUnsignedWarningAt = 0
let lastReportOnlyWarningAt = 0
let lastFailureAlertAt = 0
let lastUnsignedAlertAt = 0
let failureEvents: FailureEvent[] = []
let lastValidSignatureAt = 0
let lastValidPersistedAt = 0
/** Hash do secret de settings comprovado NESTA instância (vale mesmo se a gravação falhar). */
let locallyVerifiedHash: string | null = null
let lastVerifyPersistAttemptAt = 0

/** Invalida o cache do App Secret (chamar ao salvar/remover o secret pela UI). */
export function clearMetaAppSecretCache(): void {
  secretCache = null
  secretInflight = null
  locallyVerifiedHash = null
  lastVerifyPersistAttemptAt = 0
}

/** Zera todo o estado em memória do módulo (testes). */
export function resetMetaSignatureState(): void {
  clearMetaAppSecretCache()
  lastUnsignedWarningAt = 0
  lastReportOnlyWarningAt = 0
  lastFailureAlertAt = 0
  lastUnsignedAlertAt = 0
  failureEvents = []
  lastValidSignatureAt = 0
  lastValidPersistedAt = 0
}

export function isSignatureRequiredByEnv(): boolean {
  return String(process.env.META_WEBHOOK_REQUIRE_SIGNATURE || '').trim().toLowerCase() === 'true'
}

/**
 * App Secret usado para verificar a assinatura.
 * Precedência: env META_APP_SECRET > settings 'metaAppSecret' (cache de 60s).
 *
 * Lança erro quando o banco não responde e não há valor anterior em cache:
 * o chamador decide (evaluateMetaSignature rejeita).
 */
export async function getMetaAppSecret(): Promise<MetaAppSecretInfo> {
  const envSecret = String(process.env.META_APP_SECRET || '').trim()
  if (envSecret) return { secret: envSecret, source: 'env', verified: false, verifiedAt: null }

  const now = Date.now()
  if (secretCache && secretCache.expiresAt > now) return secretCache.value
  if (secretInflight) return secretInflight

  const lookup = (async (): Promise<MetaAppSecretInfo> => {
    try {
      const stored = await getStoredMetaAppSecretState()
      let value: MetaAppSecretInfo = { secret: null, source: null, verified: false, verifiedAt: null }
      if (stored.secret) {
        const verified = Boolean(stored.verifiedHash) && stored.verifiedHash === hashMetaAppSecret(stored.secret)
        value = {
          secret: stored.secret,
          source: 'settings',
          verified,
          verifiedAt: verified ? stored.verifiedAt : null,
        }
      }
      secretCache = { value, expiresAt: Date.now() + APP_SECRET_CACHE_TTL_MS }
      return value
    } catch (error) {
      // Falha transitória: reaproveita o último valor conhecido (mesmo expirado).
      if (secretCache) return secretCache.value
      throw error
    } finally {
      secretInflight = null
    }
  })()

  secretInflight = lookup
  return lookup
}

/**
 * HMAC-SHA256 do corpo cru com o App Secret, comparado em tempo constante.
 * Aceita apenas o formato `sha256=<64 hex>`; qualquer outra coisa é inválida.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header) return false
  const match = SIGNATURE_PATTERN.exec(header.trim())
  if (!match) return false

  const received = Buffer.from(match[1], 'hex')
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}

/** O secret de settings já foi comprovado (persistido ou nesta instância). */
function isSettingsSecretVerified(info: MetaAppSecretInfo): boolean {
  if (info.source !== 'settings' || !info.secret) return false
  if (info.verified) return true
  return Boolean(locallyVerifiedHash) && locallyVerifiedHash === hashMetaAppSecret(info.secret)
}

/** Modo aplicado quando HÁ App Secret. */
function resolveSecretMode(info: MetaAppSecretInfo): 'enforced' | 'report_only' {
  if (info.source !== 'settings') return 'enforced'
  if (isSignatureRequiredByEnv()) return 'enforced'
  return isSettingsSecretVerified(info) ? 'enforced' : 'report_only'
}

function warnUnsignedAllowed(): void {
  const now = Date.now()
  if (lastUnsignedWarningAt && now - lastUnsignedWarningAt < UNSIGNED_WARNING_INTERVAL_MS) return
  lastUnsignedWarningAt = now
  console.warn(
    '[meta-signature] ⚠️ App Secret da Meta não configurado: webhook e endpoint de Flows estão aceitando requisições SEM assinatura (qualquer um pode forjar eventos). ' +
      'Configure o App Secret em Configurações ou defina META_APP_SECRET — é isso que fecha o buraco. ' +
      'Para rejeitar requisições não assinadas mesmo sem App Secret, defina META_WEBHOOK_REQUIRE_SIGNATURE=true.'
  )
}

function warnReportOnly(reason: MetaSignatureReason): void {
  const now = Date.now()
  if (lastReportOnlyWarningAt && now - lastReportOnlyWarningAt < REPORT_ONLY_WARNING_INTERVAL_MS) return
  lastReportOnlyWarningAt = now
  console.warn(
    `[meta-signature] ⚠️ Assinatura não confere (${reason}) com o App Secret salvo em Configurações, que ainda não foi confirmado: ` +
      'requisição ACEITA (modo report_only). A verificação passa a ser exigida na primeira assinatura válida da Meta. ' +
      'Se isto se repete, confira se o App Secret é o do mesmo App que envia o webhook.'
  )
}

async function persistLastValidSignatureAt(now: number): Promise<void> {
  if (lastValidPersistedAt && now - lastValidPersistedAt < LAST_VALID_PERSIST_INTERVAL_MS) return
  lastValidPersistedAt = now
  try {
    const db = getSupabaseAdmin()
    if (!db) return
    const iso = new Date(now).toISOString()
    const { error } = await db
      .from('settings')
      .upsert({ key: META_SIGNATURE_LAST_VALID_AT_SETTING, value: iso, updated_at: iso }, { onConflict: 'key' })
    if (error) throw error
  } catch (error) {
    console.warn('[meta-signature] Falha ao registrar a última assinatura válida (best-effort):', error)
  }
}

async function readPersistedLastValidSignatureAt(): Promise<number> {
  try {
    const db = getSupabaseAdmin()
    if (!db) return 0
    const { data, error } = await db
      .from('settings')
      .select('value')
      .eq('key', META_SIGNATURE_LAST_VALID_AT_SETTING)
      .maybeSingle()
    if (error) throw error
    const parsed = Date.parse(String((data as { value?: unknown } | null)?.value || ''))
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

/**
 * Primeira assinatura válida para o secret de settings: grava o hash comprovado e
 * passa a exigir assinatura. Best-effort — se a gravação falhar, esta instância já
 * exige (locallyVerifiedHash) e tenta gravar de novo na próxima assinatura válida.
 */
async function promoteSettingsSecret(secret: string, now: number): Promise<void> {
  const hash = hashMetaAppSecret(secret)
  locallyVerifiedHash = hash
  if (lastVerifyPersistAttemptAt && now - lastVerifyPersistAttemptAt < VERIFY_PERSIST_RETRY_MS) return
  lastVerifyPersistAttemptAt = now

  try {
    const verifiedAt = new Date(now)
    await markStoredMetaAppSecretVerified(hash, verifiedAt)
    if (secretCache && secretCache.value.secret === secret) {
      secretCache = {
        ...secretCache,
        value: { ...secretCache.value, verified: true, verifiedAt: verifiedAt.toISOString() },
      }
    }
    console.info(
      '[meta-signature] ✅ App Secret de Configurações confirmado por uma assinatura válida da Meta: a assinatura passa a ser exigida (enforced).'
    )
    // Os alertas de "secret não confirmado" deixam de valer.
    await dismissMetaIntegrationAlerts(META_SIGNATURE_ALERT_ID_PREFIX)
  } catch (error) {
    console.warn('[meta-signature] Falha ao gravar a verificação do App Secret (tenta de novo depois):', error)
  }
}

async function noteValidSignature(info: MetaAppSecretInfo): Promise<void> {
  const now = Date.now()
  const firstInThisInstance = lastValidSignatureAt === 0
  lastValidSignatureAt = now
  if (info.source === 'settings' && info.secret && !info.verified) {
    await promoteSettingsSecret(info.secret, now)
  }
  if (firstInThisInstance) {
    // Há App Secret funcionando: o aviso de "App Secret ausente" não vale mais.
    // Apaga (não só dispensa): se o secret for removido depois, o aviso volta.
    await resolveMetaIntegrationAlerts(META_APP_SECRET_MISSING_ALERT_ID)
  }
  await persistLastValidSignatureAt(now)
}

/**
 * Aplica a política de assinatura ao corpo cru da request.
 * Deve rodar ANTES de qualquer processamento do payload.
 */
export async function evaluateMetaSignature(
  rawBody: string,
  header: string | null
): Promise<MetaSignatureEvaluation> {
  let info: MetaAppSecretInfo
  try {
    info = await getMetaAppSecret()
  } catch (error) {
    console.error(
      '[meta-signature] Não foi possível ler o App Secret; rejeitando a requisição (fail-closed):',
      error instanceof Error ? error.message : error
    )
    return { ok: false, mode: 'enforced', verified: false, reason: 'secret_unavailable' }
  }

  if (info.secret) {
    const mode = resolveSecretMode(info)
    const value = header?.trim() || ''
    let reason: MetaSignatureReason | null = null
    if (!value) reason = 'missing_signature'
    else if (!SIGNATURE_PATTERN.test(value)) reason = 'malformed_signature'
    else if (!verifyMetaSignature(rawBody, value, info.secret)) reason = 'invalid_signature'

    if (!reason) {
      await noteValidSignature(info)
      // Assinatura válida também promove um secret de settings ainda não comprovado.
      return { ok: true, mode: 'enforced', verified: true }
    }
    if (mode === 'enforced') return { ok: false, mode, verified: false, reason }

    warnReportOnly(reason)
    return { ok: true, mode: 'report_only', verified: false, reason }
  }

  if (isSignatureRequiredByEnv()) {
    return { ok: false, mode: 'enforced', verified: false, reason: 'app_secret_required' }
  }

  warnUnsignedAllowed()
  return { ok: true, mode: 'unsigned_allowed', verified: false, reason: 'no_app_secret' }
}

// ---------------------------------------------------------------------------
// Estatísticas e alertas
// ---------------------------------------------------------------------------

function pruneFailureEvents(now: number): void {
  const cutoff = now - FAILURE_STATS_WINDOW_MS
  if (failureEvents.length && failureEvents[0].at < cutoff) {
    failureEvents = failureEvents.filter((e) => e.at >= cutoff)
  }
  if (failureEvents.length > FAILURE_STATS_MAX_EVENTS) {
    failureEvents = failureEvents.slice(-FAILURE_STATS_MAX_EVENTS)
  }
}

function countFailures(now: number, windowMs: number, predicate: (e: FailureEvent) => boolean): number {
  const cutoff = now - windowMs
  let count = 0
  for (const e of failureEvents) if (e.at >= cutoff && predicate(e)) count++
  return count
}

export interface MetaSignatureFailureSummary {
  /** Contagem só desta instância do servidor (memória), na janela abaixo. */
  scope: 'instance'
  windowMinutes: number
  total: number
  byReason: Partial<Record<MetaSignatureReason, number>>
  lastAt: string | null
  lastReason: MetaSignatureReason | null
  lastEndpoint: MetaSignatureEndpoint | null
  lastMode: MetaSignatureMode | null
}

export function getMetaSignatureFailureSummary(now: number = Date.now()): MetaSignatureFailureSummary {
  pruneFailureEvents(now)
  const byReason: Partial<Record<MetaSignatureReason, number>> = {}
  for (const e of failureEvents) byReason[e.reason] = (byReason[e.reason] || 0) + 1
  const last = failureEvents[failureEvents.length - 1] || null
  return {
    scope: 'instance',
    windowMinutes: FAILURE_STATS_WINDOW_MS / 60_000,
    total: failureEvents.length,
    byReason,
    lastAt: last ? new Date(last.at).toISOString() : null,
    lastReason: last?.reason ?? null,
    lastEndpoint: last?.endpoint ?? null,
    lastMode: last?.mode ?? null,
  }
}

type FailureAlertKind = 'rejects_all' | 'secret_unconfirmed' | 'enforced_rejections'

function buildFailureAlert(
  kind: FailureAlertKind,
  count: number
): { message: string; action: string } {
  if (kind === 'rejects_all') {
    return {
      message:
        'O webhook da Meta está rejeitando todas as requisições: META_WEBHOOK_REQUIRE_SIGNATURE=true, mas nenhum App Secret está configurado.',
      action:
        'Configure o App Secret em Configurações (ou META_APP_SECRET) ou remova META_WEBHOOK_REQUIRE_SIGNATURE. Enquanto isso, mensagens recebidas e status não são processados.',
    }
  }
  if (kind === 'secret_unconfirmed') {
    return {
      message:
        `O App Secret salvo em Configurações ainda não foi confirmado: ${count} requisição(ões) recente(s) ao webhook/Flows chegaram com assinatura que não confere com ele. ` +
        'A verificação de assinatura ainda NÃO está ativa (essas requisições foram aceitas).',
      action:
        'Confira se o App Secret é o do mesmo App da Meta que envia o webhook (developers.facebook.com > App > Configurações > Básico). ' +
        'Quando chegar uma requisição com assinatura válida, a verificação passa a ser exigida e este aviso é dispensado automaticamente.',
    }
  }
  return {
    message:
      `${count} requisições ao webhook/Flows da Meta foram rejeitadas por assinatura inválida nos últimos ${ENFORCED_ALERT_WINDOW_MS / 60_000} min, ` +
      'sem nenhuma assinatura válida no mesmo período.',
    action:
      'Se mensagens recebidas e status de entrega pararam de chegar, o App Secret pode ter sido trocado na Meta ("Reset App Secret"): atualize-o em Configurações. ' +
      'Se tudo continua chegando normalmente, as requisições rejeitadas não vieram da Meta e nada precisa ser feito.',
  }
}

function classifyFailureAlert(evaluation: MetaSignatureEvaluation, now: number): { kind: FailureAlertKind; count: number } | null {
  if (evaluation.reason === 'app_secret_required') return { kind: 'rejects_all', count: 1 }
  // A Meta SEMPRE manda `sha256=<64 hex>`: header ausente/malformado nunca indica
  // configuração errada — é ruído ou tentativa de forjar. Só conta na estatística.
  if (evaluation.reason !== 'invalid_signature') return null

  if (evaluation.mode === 'report_only') {
    const count = countFailures(now, REPORT_ONLY_ALERT_WINDOW_MS, (e) => e.reason === 'invalid_signature' && e.mode === 'report_only')
    return count >= REPORT_ONLY_ALERT_MIN_FAILURES ? { kind: 'secret_unconfirmed', count } : null
  }

  if (evaluation.mode === 'enforced') {
    if (lastValidSignatureAt && now - lastValidSignatureAt < ENFORCED_ALERT_WINDOW_MS) return null
    const count = countFailures(now, ENFORCED_ALERT_WINDOW_MS, (e) => e.reason === 'invalid_signature' && e.mode === 'enforced')
    return count >= ENFORCED_ALERT_MIN_FAILURES ? { kind: 'enforced_rejections', count } : null
  }
  return null
}

async function reportUnsignedAllowed(now: number): Promise<void> {
  if (lastUnsignedAlertAt && now - lastUnsignedAlertAt < UNSIGNED_WARNING_INTERVAL_MS) return
  lastUnsignedAlertAt = now
  // id fixo + ignoreDuplicates: aparece uma vez; dispensado pelo usuário, não volta.
  // Quando o sistema vê o problema resolvido (secret salvo / assinatura válida), a
  // linha é APAGADA (resolveMetaIntegrationAlerts): se o secret for removido
  // depois, o aviso volta.
  await createMetaIntegrationAlert({
    idPrefix: META_APP_SECRET_MISSING_ALERT_ID,
    bucket: '',
    message:
      'App Secret da Meta não configurado: o webhook e o endpoint de Flows aceitam requisições sem assinatura.',
    action: META_APP_SECRET_RECOMMENDED_ACTION,
    details: { kind: 'app_secret_missing' },
    now,
  })
}

/**
 * Registra uma request NÃO verificada (rejeitada em 'enforced' ou aceita em
 * 'report_only'/'unsigned_allowed'). Chamar sempre que `!evaluation.verified`.
 *
 * - Atualiza a estatística em memória (diagnóstico).
 * - account_alert (type 'meta_integration', nunca 'auth') só quando indica
 *   configuração errada: secret de settings que nunca confere (report_only),
 *   rejeições repetidas SEM nenhuma assinatura válida no período (enforced) ou
 *   META_WEBHOOK_REQUIRE_SIGNATURE sem secret. Header ausente/malformado não alerta.
 * - Rate limit: 1 tentativa por instância a cada 10 min; não cria se já houver
 *   alerta de assinatura ativo; id determinístico por hora deduplica entre instâncias.
 *
 * Best-effort: nunca lança.
 */
export async function reportMetaSignatureFailure(params: {
  evaluation: MetaSignatureEvaluation
  endpoint: MetaSignatureEndpoint
}): Promise<void> {
  const { evaluation, endpoint } = params
  if (evaluation.verified) return
  const now = Date.now()

  if (evaluation.reason === 'no_app_secret') {
    await reportUnsignedAllowed(now)
    return
  }
  // Falha ao ler o secret = banco com problema; gravar alerta também falharia.
  if (!evaluation.reason || evaluation.reason === 'secret_unavailable') return

  failureEvents.push({ at: now, reason: evaluation.reason, endpoint, mode: evaluation.mode })
  pruneFailureEvents(now)

  const classified = classifyFailureAlert(evaluation, now)
  if (!classified) return

  if (lastFailureAlertAt && now - lastFailureAlertAt < FAILURE_ALERT_LOCAL_THROTTLE_MS) return
  lastFailureAlertAt = now

  if (classified.kind === 'enforced_rejections') {
    // Outra instância pode estar recebendo o tráfego válido da Meta.
    const persistedLastValid = await readPersistedLastValidSignatureAt()
    if (persistedLastValid && now - persistedLastValid < ENFORCED_ALERT_WINDOW_MS) {
      console.warn(
        '[meta-signature] Rejeições de assinatura ignoradas para alerta: assinaturas válidas da Meta continuam chegando (provável tentativa de forjar).'
      )
      return
    }
  }

  const { message, action } = buildFailureAlert(classified.kind, classified.count)
  await createMetaIntegrationAlert({
    idPrefix: META_SIGNATURE_ALERT_ID_PREFIX,
    message,
    action,
    details: {
      kind: classified.kind,
      reason: evaluation.reason,
      mode: evaluation.mode,
      endpoint,
      count: classified.count,
    },
    now,
  })
}

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

/** Status de configuração para diagnóstico (não expõe o secret). */
export interface MetaSignatureStatus {
  mode: MetaSignatureMode
  verification: MetaSignatureVerification
  secretSource: MetaAppSecretSource
  requireSignature: boolean
  /** true quando todo POST está sendo rejeitado (exige assinatura sem App Secret). */
  rejectsAll: boolean
  /** Quando o secret de settings foi comprovado por uma assinatura válida. */
  verifiedAt: string | null
  /** Última assinatura válida vista (persistida com throttle, ou desta instância). */
  lastValidSignatureAt: string | null
  recentFailures: MetaSignatureFailureSummary
  /** Últimos account_alerts de assinatura (todas as instâncias), inclusive dispensados. */
  recentAlerts: MetaIntegrationAlertSummary[]
  error: string | null
  recommendedAction: string | null
}

export async function getMetaSignatureStatus(): Promise<MetaSignatureStatus> {
  const requireSignature = isSignatureRequiredByEnv()
  const [persistedLastValid, recentAlerts] = await Promise.all([
    readPersistedLastValidSignatureAt(),
    listRecentMetaIntegrationAlerts(META_SIGNATURE_ALERT_ID_PREFIX, 5),
  ])
  const lastValid = Math.max(persistedLastValid, lastValidSignatureAt)
  const base = {
    requireSignature,
    lastValidSignatureAt: lastValid ? new Date(lastValid).toISOString() : null,
    recentFailures: getMetaSignatureFailureSummary(),
    recentAlerts,
  }

  try {
    const info = await getMetaAppSecret()
    if (info.secret) {
      const mode = resolveSecretMode(info)
      const verification: MetaSignatureVerification =
        info.source !== 'settings'
          ? 'not_applicable'
          : isSettingsSecretVerified(info)
            ? 'verified'
            : 'pending_verification'
      return {
        ...base,
        mode,
        verification,
        secretSource: info.source,
        rejectsAll: false,
        verifiedAt: info.verifiedAt,
        error: null,
        recommendedAction: mode === 'report_only' ? META_APP_SECRET_PENDING_ACTION : null,
      }
    }
    return {
      ...base,
      mode: requireSignature ? 'enforced' : 'unsigned_allowed',
      verification: requireSignature ? 'not_applicable' : 'unsigned_allowed',
      secretSource: null,
      rejectsAll: requireSignature,
      verifiedAt: null,
      error: null,
      recommendedAction: META_APP_SECRET_RECOMMENDED_ACTION,
    }
  } catch (error) {
    return {
      ...base,
      mode: 'enforced',
      verification: 'not_applicable',
      secretSource: null,
      rejectsAll: false,
      verifiedAt: null,
      error: error instanceof Error ? error.message : String(error),
      recommendedAction: null,
    }
  }
}
