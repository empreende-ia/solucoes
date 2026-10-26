import { NextResponse } from 'next/server'
import type { AttendantPermissions } from '@/types'

/**
 * Principal = QUEM está fazendo a request, resolvido UMA vez pelo proxy.ts.
 *
 * Contrato:
 * - O proxy SEMPRE remove os headers `x-dispara-*` que vierem do cliente
 *   (stripPrincipalHeaders) e só então grava os que ele mesmo resolveu
 *   (applyPrincipalHeaders) via `NextResponse.next({ request: { headers } })`.
 * - Route handlers leem com getPrincipal()/requirePrincipal()/requireAttendantPermission().
 *   Nunca confie em headers `x-dispara-*` fora deste módulo.
 * - Se o proxy não rodou (matcher quebrado, chamada direta em teste), não há
 *   principal → os helpers negam (fail-closed).
 */

export const PRINCIPAL_HEADER = 'x-dispara-principal'
export const ATTENDANT_ID_HEADER = 'x-dispara-attendant-id'
export const ATTENDANT_PERMS_HEADER = 'x-dispara-attendant-perms'

const PRINCIPAL_HEADER_PREFIX = 'x-dispara-'

export type PrincipalKind =
  | 'session'    // dashboard com cookie dispara_session VALIDADO
  | 'api_key'    // DISPARA_API_KEY
  | 'admin_key'  // DISPARA_ADMIN_KEY
  | 'cron'       // Bearer CRON_SECRET (pg_cron / auto-reinvocação)
  | 'attendant'  // token de atendente válido (cookie dispara_attendant ou header)
  | 'public'     // rota pública ou com auth própria (Meta, Google, formulário público)

export interface AttendantPrincipal {
  id: string
  name: string
  permissions: AttendantPermissions
}

export interface Principal {
  kind: PrincipalKind
  attendant?: AttendantPrincipal
}

const PRINCIPAL_KINDS: readonly PrincipalKind[] = [
  'session',
  'api_key',
  'admin_key',
  'cron',
  'attendant',
  'public',
] as const

/** Principais com acesso total ao dashboard/API (dono da instância). */
export const OWNER_KINDS: readonly PrincipalKind[] = ['session', 'api_key', 'admin_key'] as const

export function stripPrincipalHeaders(headers: Headers): void {
  const toDelete: string[] = []
  headers.forEach((_value, key) => {
    if (key.toLowerCase().startsWith(PRINCIPAL_HEADER_PREFIX)) toDelete.push(key)
  })
  for (const key of toDelete) headers.delete(key)
}

export function applyPrincipalHeaders(headers: Headers, principal: Principal): void {
  stripPrincipalHeaders(headers)
  headers.set(PRINCIPAL_HEADER, principal.kind)
  if (principal.kind === 'attendant' && principal.attendant) {
    headers.set(ATTENDANT_ID_HEADER, principal.attendant.id)
    headers.set(
      ATTENDANT_PERMS_HEADER,
      JSON.stringify({
        canView: principal.attendant.permissions.canView === true,
        canReply: principal.attendant.permissions.canReply === true,
        canHandoff: principal.attendant.permissions.canHandoff === true,
      })
    )
  }
}

function isPrincipalKind(value: string | null): value is PrincipalKind {
  return !!value && (PRINCIPAL_KINDS as readonly string[]).includes(value)
}

function parsePermissions(raw: string | null): AttendantPermissions | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AttendantPermissions>
    return {
      canView: parsed.canView === true,
      canReply: parsed.canReply === true,
      canHandoff: parsed.canHandoff === true,
    }
  } catch {
    return null
  }
}

export function getPrincipal(request: Request): Principal | null {
  const kind = request.headers.get(PRINCIPAL_HEADER)
  if (!isPrincipalKind(kind)) return null

  if (kind === 'attendant') {
    const id = request.headers.get(ATTENDANT_ID_HEADER)
    const permissions = parsePermissions(request.headers.get(ATTENDANT_PERMS_HEADER))
    if (!id || !permissions) return null
    return { kind, attendant: { id, name: '', permissions } }
  }

  return { kind }
}

function unauthorized(message: string): NextResponse {
  return NextResponse.json({ error: 'Unauthorized', message }, { status: 401 })
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: 'Forbidden', message }, { status: 403 })
}

/**
 * Exige que o principal esteja entre `allowed`. Retorna a resposta de erro
 * (401/403) ou null quando autorizado.
 */
export function requirePrincipal(
  request: Request,
  allowed: readonly PrincipalKind[] = OWNER_KINDS
): NextResponse | null {
  const principal = getPrincipal(request)
  if (!principal || principal.kind === 'public') return unauthorized('Autenticação necessária')
  if (!allowed.includes(principal.kind)) return forbidden('Acesso não permitido para este tipo de credencial')
  return null
}

/**
 * Para rotas compartilhadas entre dashboard e PWA de atendente:
 * - dono (sessão/API key/admin) passa sempre;
 * - atendente passa só se tiver a permissão pedida.
 */
export function requireAttendantPermission(
  request: Request,
  permission: keyof AttendantPermissions
): NextResponse | null {
  const principal = getPrincipal(request)
  if (!principal || principal.kind === 'public') return unauthorized('Autenticação necessária')
  if ((OWNER_KINDS as readonly string[]).includes(principal.kind)) return null
  if (principal.kind === 'attendant' && principal.attendant?.permissions[permission] === true) return null
  return forbidden(`Permissão de atendente necessária: ${permission}`)
}
