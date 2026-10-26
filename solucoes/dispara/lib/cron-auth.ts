import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqualString } from '@/lib/safe-compare'

/**
 * Autenticação das chamadas de cron.
 *
 * Substitui a verificação de assinatura `upstash-signature` que existia enquanto o
 * disparo era orquestrado pelo QStash. O relógio do Dispara agora é o pg_cron do
 * Supabase (via pg_net), que lê o `cron_secret` do Supabase Vault e o envia no header.
 *
 * Aceita, nesta ordem:
 *  - Authorization: Bearer <CRON_SECRET>      → pg_cron / auto-reinvocação
 *  - Authorization: Bearer <DISPARA_ADMIN_KEY> → disparo manual do admin (e fallback
 *    do reinvokeSelf quando CRON_SECRET não existe)
 *
 * NÃO aceita o header `x-vercel-cron`: o vercel.json não define crons e o header é
 * forjável por qualquer cliente (principalmente em self-host/Docker).
 *
 * Fail-closed: sem header válido, nega. Comparação em tempo constante pra não vazar
 * o segredo por timing. É defesa em profundidade: o proxy.ts já exige o principal
 * `cron` nas rotas com política `cron` (lib/route-policy.ts).
 */

export interface CronAuthResult {
  valid: boolean
  source?: 'cron_secret' | 'admin_key'
  error?: string
}

export function verifyCronRequest(request: Pick<NextRequest, 'headers'>): CronAuthResult {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (bearer) {
    // Avalia as duas comparações sempre (sem curto-circuito).
    const isCronSecret = timingSafeEqualString(bearer, process.env.CRON_SECRET)
    const isAdminKey = timingSafeEqualString(bearer, process.env.DISPARA_ADMIN_KEY)
    if (isCronSecret) {
      return { valid: true, source: 'cron_secret' }
    }
    if (isAdminKey) {
      return { valid: true, source: 'admin_key' }
    }
  }

  return { valid: false, error: 'Chamada de cron não autenticada' }
}

export function cronUnauthorizedResponse(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: 'Unauthorized', message }, { status: 401 })
}
