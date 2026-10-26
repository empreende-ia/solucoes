import { getSupabaseAdmin } from '@/lib/supabase'
import type { AttendantPrincipal } from '@/lib/principal'
import type { AttendantPermissions } from '@/types'

/**
 * Autenticação de atendente (PWA /atendimento).
 *
 * Fluxo:
 * 1. O atendente abre /atendimento?token=<token>.
 * 2. POST /api/attendants/validate valida o token e grava o cookie httpOnly
 *    `dispara_attendant` (ATTENDANT_COOKIE_NAME).
 * 3. Daí em diante o browser manda o cookie em toda chamada; o proxy resolve o
 *    atendente aqui (resolveAttendantToken) só nas rotas com política
 *    `attendant_or_session`, e repassa o principal para a rota (lib/principal.ts).
 * 4. A rota exige a permissão certa com requireAttendantPermission().
 *
 * Revogar/desativar/expirar o token ou rebaixar permissões derruba o acesso em
 * até CACHE_TTL_MS. clearAttendantAuthCache() NÃO encurta isso no proxy: o proxy
 * roda em outro bundle/função, com a própria cópia deste módulo (e deste cache);
 * a limpeza só vale para a cópia de quem chamou (as rotas). Por isso o TTL
 * positivo é curto: é ele que limita a janela pós-revogação no proxy.
 */

export const ATTENDANT_COOKIE_NAME = 'dispara_attendant'
export const ATTENDANT_TOKEN_HEADER = 'x-attendant-token'

// 5s: ~1 lookup indexado (UNIQUE token) a cada 5s por atendente ativo e por
// instância do proxy, em troca de uma janela curta após a revogação.
const CACHE_TTL_MS = 5_000
const NEGATIVE_CACHE_TTL_MS = 10_000
// Em erro de banco, o último resultado POSITIVO conhecido continua valendo por
// este tempo (stale-if-error). Revogação volta a valer assim que o banco responder.
const STALE_IF_ERROR_MS = 5 * 60_000
const MAX_CACHE_ENTRIES = 500
const MIN_TOKEN_LENGTH = 16
const MAX_TOKEN_LENGTH = 256

/**
 * Resultado da resolução de um token de atendente.
 * - valid       → token ativo e não expirado.
 * - invalid     → token ausente, malformado, inexistente, inativo ou expirado.
 * - unavailable → não deu para consultar o banco (Supabase fora/não configurado).
 *                 Quem chama deve responder 503 e NÃO apagar o cookie do atendente.
 */
export type AttendantResolution =
  | { status: 'valid'; principal: AttendantPrincipal }
  | { status: 'invalid' }
  | { status: 'unavailable' }

type CacheEntry = { value: AttendantPrincipal | null; expiresAt: number; staleUntil: number }

const cache = new Map<string, CacheEntry>()

function normalizePermissions(raw: unknown): AttendantPermissions {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<AttendantPermissions>
  return {
    canView: p.canView === true,
    canReply: p.canReply === true,
    canHandoff: p.canHandoff === true,
  }
}

function remember(token: string, value: AttendantPrincipal | null, now: number): void {
  if (!cache.has(token) && cache.size >= MAX_CACHE_ENTRIES) {
    // Evicção simples: descarta o mais antigo inserido.
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(token, {
    value,
    expiresAt: now + (value ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
    staleUntil: value ? now + STALE_IF_ERROR_MS : 0,
  })
}

/**
 * Limpa o cache DESTA cópia do módulo (usado ao revogar/editar tokens e nos
 * testes). Não alcança o cache do proxy — ver o cabeçalho do arquivo.
 */
export function clearAttendantAuthCache(): void {
  cache.clear()
}

/** Serve o último positivo conhecido durante uma falha de banco; senão, 'unavailable'. */
function staleOrUnavailable(token: string, now: number): AttendantResolution {
  const cached = cache.get(token)
  if (cached?.value && cached.staleUntil > now) return { status: 'valid', principal: cached.value }
  return { status: 'unavailable' }
}

/**
 * Resolve um token de atendente distinguindo token inválido de banco indisponível.
 */
export async function resolveAttendantTokenDetailed(token: string | null | undefined): Promise<AttendantResolution> {
  if (!token) return { status: 'invalid' }
  const trimmed = token.trim()
  if (trimmed.length < MIN_TOKEN_LENGTH || trimmed.length > MAX_TOKEN_LENGTH) return { status: 'invalid' }

  const now = Date.now()
  const cached = cache.get(trimmed)
  if (cached && cached.expiresAt > now) {
    return cached.value ? { status: 'valid', principal: cached.value } : { status: 'invalid' }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return staleOrUnavailable(trimmed, now)

  let data: { id: unknown; name: unknown; permissions: unknown; is_active: unknown; expires_at: unknown } | null = null
  try {
    const result = await supabase
      .from('attendant_tokens')
      .select('id, name, permissions, is_active, expires_at')
      .eq('token', trimmed)
      .maybeSingle()

    if (result.error) {
      // Erro de banco: não cacheia o resultado; serve o último positivo, se houver.
      console.error('[attendant-auth] Falha ao validar token de atendente:', result.error.message)
      return staleOrUnavailable(trimmed, now)
    }
    data = result.data
  } catch (error) {
    console.error('[attendant-auth] Falha ao validar token de atendente:', error instanceof Error ? error.message : error)
    return staleOrUnavailable(trimmed, now)
  }

  let principal: AttendantPrincipal | null = null
  if (data && data.is_active === true) {
    const expired = data.expires_at ? new Date(String(data.expires_at)).getTime() <= now : false
    if (!expired) {
      principal = {
        id: String(data.id),
        name: String(data.name ?? ''),
        permissions: normalizePermissions(data.permissions),
      }
    }
  }

  remember(trimmed, principal, now)
  return principal ? { status: 'valid', principal } : { status: 'invalid' }
}

/**
 * Atalho que achata o resultado: principal quando válido, null caso contrário
 * (inclusive banco indisponível). Prefira resolveAttendantTokenDetailed quando
 * precisar responder 503 em vez de 401.
 */
export async function resolveAttendantToken(token: string | null | undefined): Promise<AttendantPrincipal | null> {
  const result = await resolveAttendantTokenDetailed(token)
  return result.status === 'valid' ? result.principal : null
}

/** Extrai o token de atendente do cookie (preferido) ou do header X-Attendant-Token. */
export function readAttendantToken(request: {
  cookies: { get(name: string): { value: string } | undefined }
  headers: Headers
}): string | null {
  return request.cookies.get(ATTENDANT_COOKIE_NAME)?.value || request.headers.get(ATTENDANT_TOKEN_HEADER) || null
}
