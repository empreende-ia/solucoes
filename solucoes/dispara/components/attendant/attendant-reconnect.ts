/**
 * Regras de reconexão da PWA de atendente (/atendimento).
 *
 * Uma falha transitória (banco oscilando → 503 do proxy ou de
 * /api/attendants/validate, 5xx, rede caindo) NÃO é veredito sobre o token:
 * o cookie continua válido e a PWA deve mostrar "reconectando" e tentar de novo.
 * Só 401/403 significam sessão encerrada/sem permissão.
 */

const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000

/** 5xx (inclui o 503 com Retry-After), 408 e 429: vale tentar de novo. */
export function isTransientHttpStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

/**
 * Atraso da próxima tentativa: backoff exponencial (1s, 2s, 4s… até 30s),
 * nunca abaixo do Retry-After (em segundos) que o servidor pediu.
 */
export function computeReconnectDelay(attempt: number, retryAfter: string | null = null): number {
  const exponential = RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt)
  const seconds = retryAfter ? Number(retryAfter) : NaN
  const serverHint = Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 0
  return Math.min(RECONNECT_MAX_DELAY_MS, Math.max(exponential, serverHint))
}
