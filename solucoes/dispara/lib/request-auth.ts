import type { NextResponse } from 'next/server'
import { OWNER_KINDS, requirePrincipal } from '@/lib/principal'

/**
 * Require either:
 * - a valid browser session (dispara_session cookie VALIDADO pelo proxy), OR
 * - a valid API key (Authorization: Bearer ... / X-API-Key), OR
 * - DISPARA_ADMIN_KEY
 *
 * Lê o principal que o proxy.ts resolveu e repassou via headers `x-dispara-*`
 * (lib/principal.ts). Sem principal (proxy não rodou) → 401 (fail-closed).
 *
 * Security goal: defense-in-depth for critical endpoints (PII, destructive actions),
 * even if Proxy rules change or a route is accidentally exposed.
 *
 * Mantém a assinatura async antiga para não mexer nos chamadores.
 */
export async function requireSessionOrApiKey(request: Request): Promise<NextResponse | null> {
  return requirePrincipal(request, OWNER_KINDS)
}
