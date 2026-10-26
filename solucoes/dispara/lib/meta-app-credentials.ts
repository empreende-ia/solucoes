import { createHash } from 'node:crypto'
import { settingsDb } from '@/lib/supabase-db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

/** Chaves em settings ligadas ao App Secret (o valor do secret nunca sai do servidor). */
export const META_APP_SECRET_SETTING = 'metaAppSecret'
/** sha256 do App Secret já comprovado por uma assinatura válida da Meta. */
export const META_APP_SECRET_VERIFIED_HASH_SETTING = 'metaAppSecretVerifiedHash'
/** Quando o App Secret atual foi comprovado (ISO). */
export const META_APP_SECRET_VERIFIED_AT_SETTING = 'metaAppSecretVerifiedAt'

export interface MetaAppCredentials {
  appId: string
  appSecret: string
}

/**
 * Retorna apenas o App ID (sem exigir secret).
 *
 * Necessário para APIs da Meta que usam caminhos baseados em /{app_id}/...
 * (ex.: Resumable Upload API) mas não exigem appSecret.
 *
 * Fonte única: Supabase Settings (configurado via UI)
 */
export async function getMetaAppId(): Promise<string | null> {
  try {
    const dbAppIdRaw = await settingsDb.get('metaAppId')
    const appId = String(dbAppIdRaw || '').trim()
    return appId || null
  } catch {
    return null
  }
}

/**
 * Credenciais do App da Meta (opcional).
 *
 * Usadas para validação forte de tokens via Graph API `/debug_token`.
 *
 * Fonte única: Supabase Settings (configurado via UI)
 */
export async function getMetaAppCredentials(): Promise<MetaAppCredentials | null> {
  try {
    const [dbAppId, dbSecret] = await Promise.all([
      settingsDb.get('metaAppId'),
      settingsDb.get('metaAppSecret'),
    ])

    const appId = String(dbAppId || '').trim()
    const appSecret = String(dbSecret || '').trim()

    if (!appId || !appSecret) return null

    return { appId, appSecret }
  } catch {
    return null
  }
}

/**
 * App Secret salvo pela UI (settings 'metaAppSecret'), independente do App ID.
 *
 * Usado na verificação de assinatura (X-Hub-Signature-256) do webhook e do
 * endpoint de Flows. Diferente das funções acima, NÃO engole erro de leitura:
 * quem verifica assinatura precisa distinguir "não configurado" (null) de
 * "não consegui ler" (throw) para não abrir o webhook por falha transitória do banco.
 */
export async function getStoredMetaAppSecret(): Promise<string | null> {
  const client = getSupabaseAdmin()
  // Supabase não configurado (wizard) → não há nada salvo.
  if (!client) return null

  const { data, error } = await client
    .from('settings')
    .select('value')
    .eq('key', 'metaAppSecret')
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao ler metaAppSecret: ${error.message}`)
  }

  const secret = String((data as { value?: unknown } | null)?.value || '').trim()
  return secret || null
}

/** sha256 (hex) do App Secret: identifica QUAL secret foi comprovado, sem guardá-lo de novo. */
export function hashMetaAppSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export interface StoredMetaAppSecretState {
  secret: string | null
  /** sha256 do secret comprovado por uma assinatura válida (null = nunca comprovado). */
  verifiedHash: string | null
  verifiedAt: string | null
}

/**
 * App Secret salvo pela UI + estado de verificação, numa única leitura.
 *
 * O secret de settings só passa a ser EXIGIDO (modo 'enforced') depois que uma
 * requisição da Meta chega com assinatura válida para ele (verifiedHash confere com
 * o secret atual). Até lá a verificação roda em 'report_only' — ver
 * lib/meta-webhook-signature.ts.
 *
 * Mesma semântica de getStoredMetaAppSecret: lança em erro de leitura.
 */
export async function getStoredMetaAppSecretState(): Promise<StoredMetaAppSecretState> {
  const client = getSupabaseAdmin()
  if (!client) return { secret: null, verifiedHash: null, verifiedAt: null }

  const { data, error } = await client
    .from('settings')
    .select('key, value')
    .in('key', [
      META_APP_SECRET_SETTING,
      META_APP_SECRET_VERIFIED_HASH_SETTING,
      META_APP_SECRET_VERIFIED_AT_SETTING,
    ])

  if (error) {
    throw new Error(`Falha ao ler metaAppSecret: ${error.message}`)
  }

  const values = new Map<string, string>()
  for (const row of (Array.isArray(data) ? data : []) as Array<{ key?: unknown; value?: unknown }>) {
    if (typeof row?.key === 'string') values.set(row.key, String(row.value ?? '').trim())
  }

  return {
    secret: values.get(META_APP_SECRET_SETTING) || null,
    verifiedHash: values.get(META_APP_SECRET_VERIFIED_HASH_SETTING) || null,
    verifiedAt: values.get(META_APP_SECRET_VERIFIED_AT_SETTING) || null,
  }
}

async function writeVerificationSettings(hash: string, at: string): Promise<void> {
  const client = getSupabaseAdmin()
  if (!client) throw new Error('Supabase não configurado')
  const updatedAt = new Date().toISOString()
  const { error } = await client.from('settings').upsert(
    [
      { key: META_APP_SECRET_VERIFIED_HASH_SETTING, value: hash, updated_at: updatedAt },
      { key: META_APP_SECRET_VERIFIED_AT_SETTING, value: at, updated_at: updatedAt },
    ],
    { onConflict: 'key' }
  )
  if (error) throw new Error(`Falha ao gravar verificação do App Secret: ${error.message}`)
}

/** Grava que o secret com este hash foi comprovado por uma assinatura válida da Meta. */
export async function markStoredMetaAppSecretVerified(secretHash: string, verifiedAt: Date = new Date()): Promise<void> {
  await writeVerificationSettings(secretHash, verifiedAt.toISOString())
}

/**
 * Zera a verificação (secret trocado/apagado pela UI): o próximo secret volta a
 * 'report_only' até a Meta mandar uma assinatura válida para ele.
 */
export async function clearStoredMetaAppSecretVerification(): Promise<void> {
  await writeVerificationSettings('', '')
}

const GRAPH_APP_VALIDATION_URL = 'https://graph.facebook.com/v24.0'
const GRAPH_APP_VALIDATION_TIMEOUT_MS = 6000
// Códigos da Graph que indicam indisponibilidade/limite (não dizem nada sobre o secret).
const GRAPH_TRANSIENT_ERROR_CODES = new Set([1, 2, 4, 17, 32, 341, 613])

export type MetaAppCredentialsValidation =
  | { status: 'valid' }
  | { status: 'invalid'; message: string; graphCode: number | null }
  | { status: 'unavailable'; message: string }

/**
 * Confere o par App ID + App Secret na Graph API com o app access token
 * (`{appId}|{appSecret}`, enviado no header — nunca na URL).
 *
 * - 'invalid': a Meta recusou o par (secret de outro App, Client Token colado no
 *   lugar, typo, secret antigo depois de um "Reset App Secret");
 * - 'unavailable': timeout, 5xx, rate limit ou erro de rede — não dá para concluir
 *   nada; quem chama decide (o save grava e o secret fica em 'report_only').
 *
 * Não prova que é o App que assina o webhook: isso só a primeira assinatura válida
 * comprova (ver lib/meta-webhook-signature.ts).
 */
export async function validateMetaAppCredentials(
  appId: string,
  appSecret: string
): Promise<MetaAppCredentialsValidation> {
  const id = appId.trim()
  const secret = appSecret.trim()
  if (!id || !secret) {
    return { status: 'invalid', message: 'App ID e App Secret são obrigatórios.', graphCode: null }
  }
  if (!/^\d+$/.test(id)) {
    return { status: 'invalid', message: 'App ID inválido: deve conter apenas números.', graphCode: null }
  }

  let res: Response
  try {
    res = await fetchWithTimeout(`${GRAPH_APP_VALIDATION_URL}/${encodeURIComponent(id)}?fields=id`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${id}|${secret}` },
      cache: 'no-store',
      timeoutMs: GRAPH_APP_VALIDATION_TIMEOUT_MS,
    })
  } catch (error) {
    return {
      status: 'unavailable',
      message: `Graph API indisponível: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const json = await safeJson<{ id?: unknown; error?: { code?: unknown; message?: unknown; is_transient?: unknown } }>(res)

  if (res.ok) {
    if (String(json?.id ?? '') === id) return { status: 'valid' }
    return {
      status: 'invalid',
      message: 'A Graph API não confirmou o App ID com este App Secret.',
      graphCode: null,
    }
  }

  const graphError = json?.error
  const code = typeof graphError?.code === 'number' ? graphError.code : null
  const graphMessage = typeof graphError?.message === 'string' ? graphError.message : null
  const transient =
    res.status >= 500 ||
    res.status === 429 ||
    graphError?.is_transient === true ||
    (code !== null && GRAPH_TRANSIENT_ERROR_CODES.has(code))

  if (!graphError || transient) {
    return {
      status: 'unavailable',
      message: `Graph API respondeu ${res.status}${graphMessage ? `: ${graphMessage}` : ''}`,
    }
  }

  return {
    status: 'invalid',
    message: graphMessage || `Graph API recusou o par App ID/App Secret (HTTP ${res.status}).`,
    graphCode: code,
  }
}

/**
 * Retorna configuração pública do Meta App (sem expor secret)
 */
export async function getMetaAppConfigPublic(): Promise<{
  appId: string | null
  hasAppSecret: boolean
  isConfigured: boolean
}> {
  try {
    const [dbAppIdRaw, dbSecretRaw] = await Promise.all([
      settingsDb.get('metaAppId'),
      settingsDb.get('metaAppSecret'),
    ])

    const appId = String(dbAppIdRaw || '').trim() || null
    const hasAppSecret = Boolean(String(dbSecretRaw || '').trim())

    return {
      appId,
      hasAppSecret,
      isConfigured: Boolean(appId && hasAppSecret),
    }
  } catch {
    return {
      appId: null,
      hasAppSecret: false,
      isConfigured: false,
    }
  }
}
