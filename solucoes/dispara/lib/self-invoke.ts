import 'server-only'
import { after } from 'next/server'

/**
 * Resolve a URL pública base do deploy — mesma cadeia usada por dispatch/schedule.
 * Em produção Vercel vem de VERCEL_PROJECT_PRODUCTION_URL; em dev, localhost.
 */
export function resolveBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    'http://localhost:3000'
  )
}

/** Segredo usado pra autenticar a chamada interna (o próprio endpoint valida via verifyCronRequest). */
function internalSecret(): string {
  return process.env.CRON_SECRET || process.env.DISPARA_ADMIN_KEY || ''
}

/**
 * Headers de autenticação para chamadas internas do runtime ao próprio deploy
 * (cron de agendadas → /api/campaign/dispatch, dispatch/resend → /api/campaign/workflow).
 *
 * O proxy resolve `Bearer CRON_SECRET` (ou `Bearer DISPARA_ADMIN_KEY`, fallback quando
 * CRON_SECRET não existe) como principal `cron` — aceito só em rotas com política
 * `cron` ou `session_or_cron` (lib/route-policy.ts). Sem nenhum dos dois segredos,
 * devolve `{}` e a chamada leva 401 (falha visível, não silenciosa).
 */
export function internalAuthHeaders(): Record<string, string> {
  const secret = internalSecret()
  return secret ? { Authorization: `Bearer ${secret}` } : {}
}

/**
 * Auto-reinvocação fire-and-forget do próprio deploy.
 *
 * Substitui a re-invocação encadeada de steps do QStash Workflow: quando um worker
 * esgota o budget de wall-clock (~250s de 300s), ele chama a si mesmo pra continuar
 * o próximo lote SEM esperar o próximo tick do pg_cron. O pg_cron é a rede de
 * segurança que religa a cadeia caso este fetch se perca.
 *
 * Usa after() pra não bloquear a resposta HTTP atual.
 */
export function reinvokeSelf(path: string, body: Record<string, unknown> = {}): void {
  const url = `${resolveBaseUrl()}${path}`
  const authHeaders = internalAuthHeaders()
  if (!authHeaders.Authorization) {
    // Sem CRON_SECRET nem DISPARA_ADMIN_KEY, o endpoint-alvo (verifyCronRequest)
    // rejeita com 401. Falha ALTO em vez de disparar no escuro.
    console.error(
      `[self-invoke] Sem CRON_SECRET/DISPARA_ADMIN_KEY — chamada a ${path} seria rejeitada (401). Abortando.`
    )
    return
  }
  after(async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ ...body, source: 'self-reinvoke' }),
        keepalive: true,
      })
      if (!res.ok) {
        // Não silenciar um 4xx/5xx: o pg_cron só religa cadeias de enrollments já
        // persistidos; um disparo inicial perdido aqui NÃO tem rede de segurança.
        console.error(
          `[self-invoke] ${path} respondeu ${res.status} — disparo pode ter sido perdido.`
        )
      }
    } catch (e) {
      console.error(`[self-invoke] Falha ao chamar ${path}:`, e)
    }
  })
}
