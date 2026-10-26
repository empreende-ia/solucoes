/**
 * User Authentication System for Single-Tenant DaaS
 * 
 * Simple auth using MASTER_PASSWORD from environment variable
 * - No password hashing needed (password stored in Vercel env)
 * - httpOnly + Secure cookies for sessions
 * - Rate limiting for brute force protection
 * 
 * Usa Supabase (PostgreSQL) como banco de dados
 */

import { createHash, createHmac } from 'crypto'
import { cookies } from 'next/headers'
import { supabase, getSupabaseAdmin } from '@/lib/supabase'
import { timingSafeEqualString } from '@/lib/safe-compare'

// ============================================================================
// CONSTANTS
// ============================================================================

export const SESSION_COOKIE_NAME = 'dispara_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes
const MAX_STORED_SESSIONS = 50

// Cache da LISTA de sessões usado pelo proxy (hot path de TODA request).
// Um flood de cookies forjados custa no máximo 1 query a cada 15s por instância.
const SESSION_LIST_CACHE_TTL_MS = 15_000
// Falha de banco também é lembrada por pouco tempo (evita martelar um Supabase fora).
const SESSION_STORE_ERROR_TTL_MS = 5_000
// Stale-if-error: se a releitura falhar, o último snapshot BOM continua valendo por
// até este tempo (contado da leitura que deu certo). Curto de propósito: numa queda
// longa, sessão revogada não pode continuar valendo.
const SESSION_STALE_IF_ERROR_MS = 60_000
const MAX_SESSION_TOKEN_LENGTH = 256
const MAX_RECHECKED_TOKENS = 1_000
// Gravação da lista com compare-and-set: tentativas antes do fallback sem trava.
const SESSION_WRITE_ATTEMPTS = 3
// SESSION_SECRET mais curto que isso não é tratado como segredo de alta entropia.
const MIN_SESSION_SECRET_LENGTH = 32

// Formato do token: `s2.<uuid>.<hmac>`.
// - Chave do HMAC: derivada de um segredo de SERVIDOR de alta entropia misturado com a
//   senha: HMAC-SHA256(SESSION_SECRET ?? SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY,
//   'dispara-session-v2|' + MASTER_PASSWORD). Assim o token NÃO serve de oráculo offline
//   da MASTER_PASSWORD (o formato `s1.` usava a própria senha como chave), e trocar a
//   senha (ou o segredo de servidor) continua invalidando todas as sessões.
// - Cookie forjado sem assinatura válida é rejeitado sem tocar no banco.
// - Token assinado que não está na lista em cache pode ter sido criado por OUTRA
//   instância depois da leitura (login recente) → relê a lista (uma vez por token).
// - Tokens `s1.` NÃO são mais aceitos: no deploy desta versão cada dispositivo precisa
//   fazer login de novo UMA vez. As entradas `s1.` saem da lista na próxima gravação.
// - Sem segredo de servidor (nem SESSION_SECRET nem chave service role do Supabase) o
//   token é um UUID puro, como antes do hardening. Na prática isso só acontece numa
//   instância sem Supabase configurado, onde nem há onde guardar a sessão.
// Tokens antigos (UUID puro) continuam aceitos se estiverem na lista (compat).
const SIGNED_TOKEN_PREFIX = 's2.'
const RETIRED_SIGNED_TOKEN_PREFIX = 's1.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_HASH_RE = /^[0-9a-f]{64}$/i

// Novo formato: múltiplas sessões simultâneas (evita invalidação entre domínios/devices)
// Persistido em `settings.key = 'session_tokens'` como JSON.
// No banco fica só `tokenHash` = sha256(token): um dump de settings não entrega cookie
// válido nem o par (mensagem, HMAC). Entradas antigas `{ token }` (texto puro) continuam
// aceitas e são convertidas para hash na próxima gravação.
type StoredSession = {
  createdAt: string
  tokenHash?: string
  /** Legado: token em texto puro (gravado por versões anteriores). */
  token?: string
}

// ============================================================================
// TYPES
// ============================================================================

export interface Company {
  id: string
  name: string
  email: string
  phone: string
  createdAt: string
}

export interface UserAuthResult {
  success: boolean
  error?: string
  company?: Company
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

/**
 * Upsert a setting in the database
 */
async function upsertSetting(key: string, value: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: now }, { onConflict: 'key' })

  if (error) {
    // Não silencie erros de permissão/RLS — isso causa loops e estados falsos.
    throw new Error(`Falha ao salvar setting "${key}": ${error.message}`)
  }
}

/**
 * Get a setting from the database
 */
async function getSetting(key: string): Promise<{ value: string; updated_at: string } | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('value, updated_at')
    .eq('key', key)
    .single()

  if (error || !data) return null
  return data
}

/**
 * Delete a setting from the database
 */
async function deleteSetting(key: string): Promise<void> {
  const { error } = await supabase.from('settings').delete().eq('key', key)
  if (error) {
    throw new Error(`Falha ao remover setting "${key}": ${error.message}`)
  }
}

function parseStoredSessions(raw: string): StoredSession[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const sessions: StoredSession[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      const createdAt = entry.createdAt
      if (typeof createdAt !== 'string' || !createdAt) continue
      if (typeof entry.tokenHash === 'string' && TOKEN_HASH_RE.test(entry.tokenHash)) {
        sessions.push({ tokenHash: entry.tokenHash.toLowerCase(), createdAt })
      } else if (typeof entry.token === 'string' && entry.token.length >= 10) {
        sessions.push({ token: entry.token, createdAt })
      }
    }
    return sessions
  } catch {
    return []
  }
}

function pruneExpiredSessions(sessions: StoredSession[], now: Date): StoredSession[] {
  const maxAgeMs = SESSION_MAX_AGE * 1000
  return sessions.filter(s => {
    const created = new Date(s.createdAt)
    if (Number.isNaN(created.getTime())) return false
    return now.getTime() - created.getTime() <= maxAgeMs
  })
}

/** sha256(token) em hex — o que fica guardado no banco. */
function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Compara uma entrada da lista com o token (hash ou legado em texto puro), em tempo constante. */
function sessionEntryMatches(entry: StoredSession, token: string, tokenHash: string): boolean {
  if (entry.tokenHash) return timingSafeEqualString(entry.tokenHash, tokenHash)
  return timingSafeEqualString(entry.token, token)
}

/**
 * Formato gravado: só hashes. Converte entradas legadas `{ token }` para hash e
 * descarta as `s1.` (formato aposentado, não são mais aceitas e eram oráculo da senha).
 */
function toPersistedSessions(sessions: StoredSession[]): Array<{ tokenHash: string; createdAt: string }> {
  const out: Array<{ tokenHash: string; createdAt: string }> = []
  for (const s of sessions) {
    if (s.tokenHash) {
      out.push({ tokenHash: s.tokenHash, createdAt: s.createdAt })
    } else if (s.token && !s.token.startsWith(RETIRED_SIGNED_TOKEN_PREFIX)) {
      out.push({ tokenHash: hashSessionToken(s.token), createdAt: s.createdAt })
    }
  }
  return out.slice(-MAX_STORED_SESSIONS)
}

type SessionSnapshot = {
  /** null = `session_tokens` não existe (instância antiga: vale o token legado). */
  sessions: StoredSession[] | null
  /** Token legado único (`settings.session_token`). */
  legacy: { token: string; updatedAt: string } | null
  /** Versão da linha `session_tokens` lida (compare-and-set na gravação); null = linha não existe. */
  sessionsRow: { updatedAt: string | null } | null
}

/**
 * Lê `session_tokens` e o legado `session_token` numa única query, SEM escrever nada.
 * Lança quando o Supabase não está configurado ou o banco falha — quem chama decide
 * se isso é "indisponível" (proxy) ou erro (login/logout). Nunca trata erro como
 * "lista vazia": isso apagaria as outras sessões no próximo createSession.
 */
async function readSessionSnapshot(): Promise<SessionSnapshot> {
  const client = getSupabaseAdmin()
  if (!client) throw new Error('Supabase não configurado')

  const { data, error } = await client
    .from('settings')
    .select('key, value, updated_at')
    .in('key', ['session_tokens', 'session_token'])

  if (error) throw new Error(`Falha ao ler sessões: ${error.message}`)

  let sessions: StoredSession[] | null = null
  let legacy: SessionSnapshot['legacy'] = null
  let sessionsRow: SessionSnapshot['sessionsRow'] = null
  for (const row of (data || []) as Array<{ key: string; value: string | null; updated_at: string | null }>) {
    if (row.key === 'session_tokens') {
      sessionsRow = { updatedAt: row.updated_at ?? null }
      if (row.value) sessions = parseStoredSessions(row.value)
    } else if (row.key === 'session_token' && row.value) {
      legacy = { token: row.value, updatedAt: row.updated_at || '' }
    }
  }
  return { sessions, legacy, sessionsRow }
}

/**
 * Grava `session_tokens` só se a linha ainda estiver na versão lida (`updated_at`).
 * Devolve false quando outra gravação chegou antes (quem chama relê e mescla de novo).
 */
async function compareAndSetSessions(value: string, expected: SessionSnapshot['sessionsRow']): Promise<boolean> {
  const client = getSupabaseAdmin()
  if (!client) throw new Error('Supabase não configurado')

  if (!expected) {
    // Primeira gravação: só insere se ninguém criou a linha nesse meio-tempo.
    const { data, error } = await client
      .from('settings')
      .upsert(
        { key: 'session_tokens', value, updated_at: new Date().toISOString() },
        { onConflict: 'key', ignoreDuplicates: true }
      )
      .select('key')
    if (error) throw new Error(`Falha ao salvar sessões: ${error.message}`)
    return Array.isArray(data) && data.length > 0
  }

  // O updated_at novo é sempre maior que o lido (relógios de instâncias diferentes).
  const expectedMs = expected.updatedAt ? new Date(expected.updatedAt).getTime() : Number.NaN
  const nextMs = Number.isNaN(expectedMs) ? Date.now() : Math.max(Date.now(), expectedMs + 1)
  const update = client
    .from('settings')
    .update({ value, updated_at: new Date(nextMs).toISOString() })
    .eq('key', 'session_tokens')
  const guarded = expected.updatedAt ? update.eq('updated_at', expected.updatedAt) : update.is('updated_at', null)
  const { data, error } = await guarded.select('key')
  if (error) throw new Error(`Falha ao salvar sessões: ${error.message}`)
  return Array.isArray(data) && data.length > 0
}

/**
 * Read-modify-write da lista de sessões com compare-and-set: dois logins (ou login e
 * logout) concorrentes não se sobrescrevem mais — quem perde relê, mescla e tenta de
 * novo. Depois de SESSION_WRITE_ATTEMPTS conflitos seguidos grava sem trava (último
 * vence, o comportamento antigo) para nunca travar o login.
 */
async function updateStoredSessions(mutate: (current: StoredSession[]) => StoredSession[]): Promise<void> {
  for (let attempt = 1; attempt <= SESSION_WRITE_ATTEMPTS; attempt++) {
    const snapshot = await readSessionSnapshot()
    const value = JSON.stringify(toPersistedSessions(mutate(snapshot.sessions ?? [])))
    if (await compareAndSetSessions(value, snapshot.sessionsRow)) return
    if (attempt < SESSION_WRITE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 40)))
    }
  }

  console.warn('[user-auth] Conflito persistente ao gravar session_tokens; gravando sem compare-and-set')
  const snapshot = await readSessionSnapshot()
  await upsertSetting('session_tokens', JSON.stringify(toPersistedSessions(mutate(snapshot.sessions ?? []))))
}

// ============================================================================
// SESSION TOKENS (formato + assinatura)
// ============================================================================

let warnedShortSessionSecret = false

/** Segredo de servidor de alta entropia usado para derivar a chave das sessões. */
function getServerSessionSecret(): string | null {
  const dedicated = process.env.SESSION_SECRET
  if (dedicated && dedicated.length >= MIN_SESSION_SECRET_LENGTH) return dedicated
  if (dedicated && !warnedShortSessionSecret) {
    warnedShortSessionSecret = true
    console.warn(
      `[user-auth] SESSION_SECRET ignorado: precisa de pelo menos ${MIN_SESSION_SECRET_LENGTH} caracteres aleatórios. Usando a chave service role do Supabase.`
    )
  }
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null
}

let signingKeyMemo: { serverSecret: string; masterPassword: string; key: Buffer } | null = null

/**
 * Chave do HMAC das sessões. A MASTER_PASSWORD entra só como parte da mensagem da
 * derivação: sem o segredo de servidor, o token não permite testar senhas offline.
 */
function getSessionSigningKey(): Buffer | null {
  const masterPassword = process.env.MASTER_PASSWORD
  const serverSecret = getServerSessionSecret()
  if (!masterPassword || !serverSecret) return null

  const memo = signingKeyMemo
  if (memo && memo.serverSecret === serverSecret && memo.masterPassword === masterPassword) return memo.key

  const key = createHmac('sha256', serverSecret).update(`dispara-session-v2|${masterPassword}`).digest()
  signingKeyMemo = { serverSecret, masterPassword, key }
  return key
}

function signSessionId(id: string, key: Buffer): string {
  return createHmac('sha256', key).update(`dispara-session:${SIGNED_TOKEN_PREFIX}${id}`).digest('base64url')
}

/** Gera um token de sessão novo (assinado quando há MASTER_PASSWORD e segredo de servidor). */
function generateSessionToken(): string {
  const id = crypto.randomUUID()
  const key = getSessionSigningKey()
  if (!key) return id
  return `${SIGNED_TOKEN_PREFIX}${id}.${signSessionId(id, key)}`
}

type TokenFormat = 'signed' | 'legacy' | 'malformed'

function classifySessionToken(token: string): TokenFormat {
  if (token.startsWith(SIGNED_TOKEN_PREFIX)) {
    const rest = token.slice(SIGNED_TOKEN_PREFIX.length)
    const dot = rest.indexOf('.')
    if (dot <= 0) return 'malformed'
    const id = rest.slice(0, dot)
    const sig = rest.slice(dot + 1)
    if (!UUID_RE.test(id) || !sig) return 'malformed'
    const key = getSessionSigningKey()
    if (!key) return 'malformed'
    return timingSafeEqualString(sig, signSessionId(id, key)) ? 'signed' : 'malformed'
  }
  // `s1.` (chave = MASTER_PASSWORD) foi aposentado: cai aqui como malformado.
  return UUID_RE.test(token) ? 'legacy' : 'malformed'
}

// ============================================================================
// SESSION VALIDATION (hot path do proxy — NUNCA escreve no banco)
// ============================================================================

/**
 * - 'valid'       → sessão existe e não expirou.
 * - 'invalid'     → token malformado, com assinatura errada, inexistente ou expirado.
 * - 'unavailable' → banco indisponível e o token é ASSINADO por este servidor (HMAC
 *                   confere): o proxy responde 503 nas APIs e deixa a página abrir em
 *                   modo degradado (sem dados: os loaders checam o principal).
 * - 'unverified'  → banco indisponível e o token é um UUID puro (legado), que não prova
 *                   nada sem o banco: trate como SEM sessão, mas sem apagar o cookie
 *                   (ele pode voltar a valer quando o banco voltar).
 */
export type SessionTokenValidity = 'valid' | 'invalid' | 'unavailable' | 'unverified'

type CachedSnapshot =
  | { ok: true; snapshot: SessionSnapshot; fetchedAt: number; expiresAt: number }
  | { ok: false; expiresAt: number }

type SnapshotRead = { promise: Promise<CachedSnapshot>; seq: number }

/** Releitura forçada de um token assinado (deduplicada entre requests concorrentes). */
type RecheckEntry = { promise: Promise<SessionTokenValidity>; expiresAt: number }

let sessionSnapshotCache: CachedSnapshot | null = null
let sessionSnapshotInflight: SnapshotRead | null = null
// Sequência das leituras iniciadas: a releitura forçada só aproveita leitura MAIS NOVA.
let sessionReadSeq = 0
// Incrementado a cada invalidação: leitura que começou antes não grava no cache.
let sessionCacheGeneration = 0
/**
 * Tokens assinados que já forçaram releitura nesta janela de cache (anti-flood).
 * Guarda a PROMISE da releitura: requests concorrentes com o mesmo token esperam o
 * mesmo resultado em vez de receber 'invalid' antes da releitura terminar.
 */
const recheckedSignedTokens = new Map<string, RecheckEntry>()

/**
 * Descarta o cache local da lista de sessões (login/logout nesta instância e testes).
 *
 * ATENÇÃO: isto só alcança a cópia do módulo deste bundle. O proxy roda em outro
 * bundle (na Vercel, outra função) com cache próprio: lá um token novo converge pela
 * releitura por token (recheckSignedToken) e um token revogado em até
 * SESSION_LIST_CACHE_TTL_MS.
 */
export function invalidateSessionCache(): void {
  sessionCacheGeneration++
  sessionSnapshotCache = null
  sessionSnapshotInflight = null
  recheckedSignedTokens.clear()
}

function startSnapshotRead(kind: 'ttl' | 'force'): Promise<CachedSnapshot> {
  const generation = sessionCacheGeneration
  const seq = ++sessionReadSeq

  const run = async (): Promise<CachedSnapshot> => {
    try {
      const snapshot = await readSessionSnapshot()
      const fetchedAt = Date.now()
      const result: CachedSnapshot = { ok: true, snapshot, fetchedAt, expiresAt: fetchedAt + SESSION_LIST_CACHE_TTL_MS }
      if (generation === sessionCacheGeneration) {
        sessionSnapshotCache = result
        // Janela nova: tokens revogados podem forçar UMA releitura de novo.
        if (kind === 'ttl') recheckedSignedTokens.clear()
      }
      return result
    } catch (error) {
      console.error('[user-auth] Session store indisponível:', error instanceof Error ? error.message : error)
      const now = Date.now()
      const failed: CachedSnapshot = { ok: false, expiresAt: now + SESSION_STORE_ERROR_TTL_MS }
      // Releitura forçada: a falha vale só para o token que pediu; o cache fica intacto.
      if (kind === 'force') return failed

      // Stale-if-error: uma oscilação não derruba todas as sessões da instância.
      const previous = sessionSnapshotCache
      if (previous?.ok && now - previous.fetchedAt <= SESSION_STALE_IF_ERROR_MS) {
        const stale: CachedSnapshot = { ...previous, expiresAt: now + SESSION_STORE_ERROR_TTL_MS }
        if (generation === sessionCacheGeneration) sessionSnapshotCache = stale
        return stale
      }
      if (generation === sessionCacheGeneration) sessionSnapshotCache = failed
      return failed
    }
  }

  const read: SnapshotRead = { promise: run(), seq }
  sessionSnapshotInflight = read
  void read.promise.then(() => {
    if (sessionSnapshotInflight === read) sessionSnapshotInflight = null
  })
  return read.promise
}

/** Snapshot em cache (ou a leitura em voo). Requests concorrentes compartilham a mesma leitura. */
function loadSessionSnapshot(): Promise<CachedSnapshot> {
  const cached = sessionSnapshotCache
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached)
  if (sessionSnapshotInflight) return sessionSnapshotInflight.promise
  return startSnapshotRead('ttl')
}

/**
 * Leitura que COMEÇA depois desta chamada. Uma leitura em voo iniciada antes pode não
 * enxergar um login gravado há pouco: espera ela terminar (as leituras ficam em série)
 * e então aproveita uma leitura mais nova ou inicia uma.
 */
async function loadFreshSessionSnapshot(): Promise<CachedSnapshot> {
  const requestedAfter = sessionReadSeq
  for (;;) {
    const inflight = sessionSnapshotInflight
    if (!inflight) break
    if (inflight.seq > requestedAfter) return inflight.promise
    await inflight.promise
  }
  return startSnapshotRead('force')
}

function isSessionAlive(createdAtIso: string, nowMs: number): boolean {
  const created = new Date(createdAtIso).getTime()
  if (Number.isNaN(created)) return false
  return nowMs - created <= SESSION_MAX_AGE * 1000
}

function snapshotHasToken(snapshot: SessionSnapshot, token: string, tokenHash: string, nowMs: number): boolean {
  // Prefer multi-session list when available
  if (snapshot.sessions) {
    let found = false
    for (const s of snapshot.sessions) {
      // Sem curto-circuito: percorre a lista inteira (tempo independe da posição).
      const match = sessionEntryMatches(s, token, tokenHash)
      if (match && isSessionAlive(s.createdAt, nowMs)) found = true
    }
    return found
  }

  // Legacy fallback: single token
  if (snapshot.legacy) {
    const updatedAt = new Date(snapshot.legacy.updatedAt).getTime()
    const sessionAgeMs = nowMs - updatedAt
    if (!Number.isNaN(sessionAgeMs) && sessionAgeMs > SESSION_MAX_AGE * 1000) return false
    return timingSafeEqualString(snapshot.legacy.token, token)
  }

  return false
}

/**
 * Token assinado por ESTE servidor que não está na lista em cache: pode ter sido
 * criado por outra instância depois da leitura (login recente). Relê a lista UMA vez
 * por token por janela de cache e todas as requests concorrentes com esse token
 * esperam essa mesma releitura. 'invalid' fica lembrado até a próxima janela (tokens
 * revogados não forçam releituras em loop); 'valid' não precisa (o cache já tem o
 * token); 'unavailable' só por SESSION_STORE_ERROR_TTL_MS.
 */
function recheckSignedToken(token: string, tokenHash: string): Promise<SessionTokenValidity> {
  const existing = recheckedSignedTokens.get(token)
  if (existing && existing.expiresAt > Date.now()) return existing.promise
  if (recheckedSignedTokens.size >= MAX_RECHECKED_TOKENS) recheckedSignedTokens.clear()

  const run = async (): Promise<SessionTokenValidity> => {
    const fresh = await loadFreshSessionSnapshot()
    const result: SessionTokenValidity = !fresh.ok
      ? 'unavailable'
      : snapshotHasToken(fresh.snapshot, token, tokenHash, Date.now())
        ? 'valid'
        : 'invalid'
    if (recheckedSignedTokens.get(token) === entry) {
      if (result === 'valid') recheckedSignedTokens.delete(token)
      else if (result === 'unavailable') entry.expiresAt = Date.now() + SESSION_STORE_ERROR_TTL_MS
    }
    return result
  }
  // `run` só lê `entry` depois do primeiro await, quando ele já foi atribuído.
  const entry: RecheckEntry = { promise: run(), expiresAt: Number.POSITIVE_INFINITY }
  recheckedSignedTokens.set(token, entry)
  return entry.promise
}

/**
 * Valida um token de sessão contra `settings.session_tokens` (e o legado `session_token`).
 * Ver SessionTokenValidity para o significado de cada resultado.
 *
 * Não escreve nada por request. A lista é cacheada por ~15s por instância; a poda de
 * sessões expiradas acontece só em createSession/logoutUser.
 */
export async function isValidSessionToken(token: string): Promise<SessionTokenValidity> {
  if (typeof token !== 'string') return 'invalid'
  const trimmed = token.trim()
  if (!trimmed || trimmed.length > MAX_SESSION_TOKEN_LENGTH) return 'invalid'

  // Cookie forjado sem assinatura válida morre aqui, sem tocar no banco.
  const format = classifySessionToken(trimmed)
  if (format === 'malformed') return 'invalid'

  const tokenHash = hashSessionToken(trimmed)
  const cached = await loadSessionSnapshot()
  // Banco fora: só token ASSINADO (prova de que este servidor o emitiu) abre o modo
  // degradado. Um UUID qualquer passaria como 'legacy' sem segredo nenhum.
  if (!cached.ok) return format === 'signed' ? 'unavailable' : 'unverified'
  if (snapshotHasToken(cached.snapshot, trimmed, tokenHash, Date.now())) return 'valid'
  if (format !== 'signed') return 'invalid'

  return recheckSignedToken(trimmed, tokenHash)
}

/**
 * Check if setup is completed (company exists)
 *
 * ATENÇÃO: em erro de banco devolve `false`. Isso é seguro só porque NENHUM caminho
 * emite sessão quando o setup "não está completo" (o antigo /api/auth/setup, que
 * fazia isso, foi removido; o login só cria sessão quando isto é `true`).
 * Não use `!isSetupComplete()` como autorização para criar sessão.
 */
export async function isSetupComplete(): Promise<boolean> {
  // Em produção, usamos a env var para evitar consultas e loops.
  if (process.env.SETUP_COMPLETE === 'true') return true

  // Em dev/local, o fluxo pode rodar sem Vercel.
  // Então consideramos "setup completo" se a empresa já foi gravada no banco.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('key', 'company_name')
        .single()

      if (error) {
        // Ajuda a diagnosticar "isSetup:false" causado por permissão negada.
        console.warn('[isSetupComplete] settings/company_name query error:', error.message)
        return false
      }
      return !!data?.value
    } catch {
      return false
    }
  }

  return false
}

/**
 * Get company info
 */
export async function getCompany(): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['company_id', 'company_name', 'company_email', 'company_phone', 'company_created_at'])

    if (error || !data || data.length === 0) return null

    const settings: Record<string, string> = {}
    data.forEach(row => {
      settings[row.key] = row.value
    })

    if (!settings.company_name) return null

    return {
      id: settings.company_id || 'default',
      name: settings.company_name,
      email: settings.company_email || '',
      phone: settings.company_phone || '',
      createdAt: settings.company_created_at || new Date().toISOString()
    }
  } catch {
    return null
  }
}

// ============================================================================
// LOGIN / LOGOUT
// ============================================================================

/**
 * Hash SHA-256 com salt fixo (mesmo algoritmo do IdentityStep no wizard).
 */
async function hashPasswordForLogin(password: string): Promise<string> {
  const SALT = '_dispara_salt_2026';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifica se uma string parece ser um hash SHA-256 (64 caracteres hexadecimais)
 */
function isHashFormat(value: string): boolean {
  return value.length === 64 && /^[a-f0-9]+$/i.test(value)
}

/**
 * Attempt login with password
 * Validates against MASTER_PASSWORD env var
 *
 * Aceita dois formatos de MASTER_PASSWORD:
 * - Hash SHA-256 (64 chars hex): compara com hash da senha digitada (retrocompatível)
 * - Texto puro: compara diretamente (mais simples para reset)
 */
export async function loginUser(password: string): Promise<UserAuthResult> {
  if (!password) {
    return { success: false, error: 'Senha é obrigatória' }
  }

  // Check if MASTER_PASSWORD is configured
  const masterPassword = process.env.MASTER_PASSWORD
  if (!masterPassword) {
    return { success: false, error: 'MASTER_PASSWORD não configurada nas variáveis de ambiente' }
  }

  // Check rate limiting
  const isLocked = await checkRateLimiting()
  if (isLocked) {
    return { success: false, error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
  }

  try {
    // Detecta automaticamente se MASTER_PASSWORD é hash ou texto puro
    const masterIsHash = isHashFormat(masterPassword)

    // Comparações em tempo constante (lib/safe-compare.ts).
    let isValid: boolean
    if (masterIsHash) {
      // Comportamento original: MASTER_PASSWORD é hash, compara com hash da senha digitada
      const passwordHash = await hashPasswordForLogin(password)
      isValid = timingSafeEqualString(passwordHash, masterPassword)
    } else {
      // Novo: MASTER_PASSWORD é texto puro, compara diretamente
      isValid = timingSafeEqualString(password, masterPassword)
    }

    if (!isValid) {
      await recordFailedAttempt()
      return { success: false, error: 'Senha incorreta' }
    }

    // Clear failed attempts on success
    await clearFailedAttempts()

    // Create session
    await createSession()

    const company = await getCompany()
    return { success: true, company: company || undefined }

  } catch (error) {
    console.error('Login error:', error)
    return { success: false, error: 'Erro ao fazer login' }
  }
}

/**
 * Logout - destroy session
 */
export async function logoutUser(): Promise<void> {
  const cookieStore = await cookies()

  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  cookieStore.delete(SESSION_COOKIE_NAME)
  if (!sessionToken) return

  // Só revoga no banco um token que a lista (cacheada) confirma como sessão viva.
  // Cookie malformado/forjado ou com assinatura errada morre no formato/HMAC sem
  // tocar no banco; um UUID qualquer custa no máximo a leitura em cache da lista.
  // Nenhum dos dois grava nada nem invalida o cache.
  let validity: SessionTokenValidity
  try {
    validity = await isValidSessionToken(sessionToken)
  } catch {
    return
  }
  if (validity !== 'valid') return

  // Remove o token atual da lista para revogar imediatamente e aproveita para podar
  // as expiradas (a poda NÃO acontece mais por request).
  const token = sessionToken.trim()
  const tokenHash = hashSessionToken(token)
  try {
    await updateStoredSessions((current) =>
      pruneExpiredSessions(current, new Date()).filter((s) => !sessionEntryMatches(s, token, tokenHash))
    )
  } catch {
    // Não bloqueia logout
  } finally {
    invalidateSessionCache()
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create a new session
 */
async function createSession(): Promise<void> {
  const cookieStore = await cookies()
  const sessionToken = generateSessionToken()

  const nowIso = new Date().toISOString()

  // Store session in database (multi-session)
  // Mantém múltiplos tokens ativos para evitar invalidação entre domínios/devices.
  // A poda das expiradas acontece aqui (e no logout), nunca por request.
  // Erro de leitura PROPAGA: tratar como lista vazia apagaria as outras sessões.
  // Compare-and-set: logins concorrentes não apagam a sessão um do outro.
  // Idempotente: numa nova tentativa a entrada não é duplicada.
  const tokenHash = hashSessionToken(sessionToken)
  await updateStoredSessions((current) => [
    ...pruneExpiredSessions(current, new Date()).filter((s) => s.tokenHash !== tokenHash),
    { tokenHash, createdAt: nowIso },
  ])

  // O legado `settings.session_token` guardava o token em TEXTO PURO (e, no formato
  // s1, um oráculo da senha). Não é mais gravado; o que sobrou é removido. A validação
  // só o consultava quando `session_tokens` não existia, e acabamos de gravá-la.
  try {
    await deleteSetting('session_token')
  } catch (error) {
    console.warn('[auth] Falha ao remover session_token legado (best-effort):', error)
  }

  // O cache local da lista não tem o token novo: descarta.
  invalidateSessionCache()

  // Set cookie
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/'
  })
}

/**
 * Validate current session (cookie do request atual).
 * Só 'valid' conta como autenticado; não escreve nada no banco.
 */
export async function validateSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!sessionToken) return false

    return (await isValidSessionToken(sessionToken)) === 'valid'
  } catch {
    return false
  }
}

/**
 * Get auth status for client
 * OPTIMIZED: Parallelized queries for better performance
 */
export async function getUserAuthStatus(): Promise<{
  isSetup: boolean
  isAuthenticated: boolean
  company: Company | null
}> {
  // Run in parallel for better performance
  const [isSetup, isAuthenticated] = await Promise.all([
    isSetupComplete(),
    validateSession()
  ])

  // Only fetch company if authenticated 
  const company = isAuthenticated ? await getCompany() : null

  return { isSetup, isAuthenticated, company }
}

// ============================================================================
// RATE LIMITING (Brute Force Protection)
// ============================================================================

async function checkRateLimiting(): Promise<boolean> {
  try {
    const setting = await getSetting('login_attempts')
    if (!setting) return false

    const attempts = parseInt(setting.value) || 0
    const lastAttempt = new Date(setting.updated_at)
    const now = new Date()

    // Reset if lockout period passed
    if (now.getTime() - lastAttempt.getTime() > LOCKOUT_DURATION) {
      await clearFailedAttempts()
      return false
    }

    return attempts >= MAX_LOGIN_ATTEMPTS
  } catch {
    return false
  }
}

async function recordFailedAttempt(): Promise<void> {
  // Get current count
  const setting = await getSetting('login_attempts')
  const currentAttempts = setting ? parseInt(setting.value) || 0 : 0

  await upsertSetting('login_attempts', (currentAttempts + 1).toString())
}

async function clearFailedAttempts(): Promise<void> {
  try {
    await deleteSetting('login_attempts')
  } catch (error) {
    console.warn('[auth] Falha ao limpar login_attempts (best-effort):', error)
  }
}

// ============================================================================
// PASSWORD INFO
// ============================================================================

/**
 * Password is managed via MASTER_PASSWORD environment variable in Vercel.
 *
 * ACEITA DOIS FORMATOS:
 * - Texto puro: "minhaSenha123" (recomendado - mais simples)
 * - Hash SHA-256: 64 caracteres hex (retrocompatível com instalações antigas)
 *
 * COMO RESETAR A SENHA:
 * 1. Vá em Vercel Dashboard → Settings → Environment Variables
 * 2. Edite MASTER_PASSWORD e coloque sua nova senha (ex: "novaSenha456")
 * 3. Clique em Save
 * 4. Vá em Deployments → clique nos 3 pontos do último deploy → Redeploy
 * 5. Pronto! Faça login com a nova senha
 *
 * SESSÕES:
 * - Trocar a MASTER_PASSWORD (ou o SESSION_SECRET / a chave service role do Supabase,
 *   de onde vem a chave do HMAC) invalida todas as sessões.
 * - SESSION_SECRET (opcional, >= 32 caracteres aleatórios) dá à assinatura das sessões
 *   um segredo próprio, independente da chave do Supabase.
 */
