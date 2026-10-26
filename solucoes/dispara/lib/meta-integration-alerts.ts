import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * account_alerts da integração com a Meta (assinatura do webhook, chaves dos Flows).
 *
 * Usam um tipo próprio ('meta_integration'), nunca 'auth': o banner trata 'auth'
 * como crítico e mostra o mais recente — um alerta disparável por terceiros com
 * type 'auth' esconderia alertas reais da Meta (token expirado, 131031...). O
 * AccountAlertBanner só mostra 'meta_integration' quando NÃO há alerta crítico.
 */
export const META_INTEGRATION_ALERT_TYPE = 'meta_integration'

export interface MetaIntegrationAlertInput {
  /** Prefixo do id (ex.: 'alert_meta_signature_'); o id final é prefixo + bucket. */
  idPrefix: string
  /** Bucket do id determinístico (dedupe entre instâncias). Default: hora atual. */
  bucket?: string | number
  message: string
  action: string
  details?: Record<string, unknown>
  now?: number
}

const DEFAULT_BUCKET_MS = 60 * 60_000

/**
 * Cria o alerta se não houver outro ATIVO com o mesmo prefixo. O id determinístico
 * com `ignoreDuplicates` deduplica entre instâncias e nunca "revive" um alerta
 * dispensado no mesmo bucket. Best-effort: nunca lança. Retorna true se tentou gravar.
 */
export async function createMetaIntegrationAlert(input: MetaIntegrationAlertInput): Promise<boolean> {
  const now = input.now ?? Date.now()
  try {
    const db = getSupabaseAdmin()
    if (!db) return false

    const { data: active, error: activeError } = await db
      .from('account_alerts')
      .select('id')
      .like('id', `${input.idPrefix}%`)
      .eq('dismissed', false)
      .limit(1)
    if (activeError) throw activeError
    if (Array.isArray(active) && active.length > 0) return false

    const bucket = input.bucket ?? Math.floor(now / DEFAULT_BUCKET_MS)
    const { error } = await db.from('account_alerts').upsert(
      {
        id: `${input.idPrefix}${bucket}`,
        type: META_INTEGRATION_ALERT_TYPE,
        code: null,
        message: input.message,
        details: JSON.stringify({ ...(input.details || {}), action: input.action }),
        dismissed: false,
        created_at: new Date(now).toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    if (error) throw error
    return true
  } catch (error) {
    console.warn('[meta-alerts] Falha ao registrar account_alert (best-effort):', error)
    return false
  }
}

/** Dispensa os alertas ativos com o prefixo (ex.: o problema foi confirmado como resolvido). */
export async function dismissMetaIntegrationAlerts(idPrefix: string): Promise<void> {
  try {
    const db = getSupabaseAdmin()
    if (!db) return
    const { error } = await db
      .from('account_alerts')
      .update({ dismissed: true })
      .like('id', `${idPrefix}%`)
      .eq('dismissed', false)
    if (error) throw error
  } catch (error) {
    console.warn('[meta-alerts] Falha ao dispensar account_alerts (best-effort):', error)
  }
}

/**
 * O SISTEMA constatou que o problema acabou (não é dispensa do usuário): APAGA as
 * linhas com o prefixo, inclusive as já dispensadas. Para alerta de id fixo
 * (bucket ''), marcar dismissed=true deixaria o id ocupado para sempre — o upsert
 * com ignoreDuplicates nunca o reabre — e o aviso não voltaria quando o problema
 * reaparecesse (ex.: o dono remove o App Secret depois). A dispensa manual do
 * usuário continua sendo um update dismissed=true, definitiva enquanto o problema
 * durar. Best-effort: nunca lança.
 */
export async function resolveMetaIntegrationAlerts(idPrefix: string): Promise<void> {
  try {
    const db = getSupabaseAdmin()
    if (!db) return
    const { error } = await db
      .from('account_alerts')
      .delete()
      .like('id', `${idPrefix}%`)
      .eq('type', META_INTEGRATION_ALERT_TYPE)
    if (error) throw error
  } catch (error) {
    console.warn('[meta-alerts] Falha ao resolver account_alerts (best-effort):', error)
  }
}

export interface MetaIntegrationAlertSummary {
  id: string
  createdAt: string
  dismissed: boolean
  message: string
  details: Record<string, unknown> | null
}

/** Últimos alertas com o prefixo (inclusive dispensados), para o diagnóstico. Nunca lança. */
export async function listRecentMetaIntegrationAlerts(
  idPrefix: string,
  limit = 5
): Promise<MetaIntegrationAlertSummary[]> {
  try {
    const db = getSupabaseAdmin()
    if (!db) return []
    const { data, error } = await db
      .from('account_alerts')
      .select('id, created_at, dismissed, message, details')
      .like('id', `${idPrefix}%`)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return ((Array.isArray(data) ? data : []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id ?? ''),
      createdAt: String(row.created_at ?? ''),
      dismissed: row.dismissed === true,
      message: String(row.message ?? ''),
      details: parseDetails(row.details),
    }))
  } catch (error) {
    console.warn('[meta-alerts] Falha ao listar account_alerts:', error)
    return []
  }
}

function parseDetails(raw: unknown): Record<string, unknown> | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}
