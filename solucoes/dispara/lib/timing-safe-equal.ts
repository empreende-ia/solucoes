import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Compara dois segredos (tokens, state OAuth, verify token...) em tempo constante.
 *
 * - Faz SHA-256 dos dois lados antes do timingSafeEqual: os buffers ficam sempre
 *   com 32 bytes (exigência do timingSafeEqual) e o tempo não vaza o tamanho do
 *   segredo esperado.
 * - Fail-closed: valor ausente ou vazio em qualquer lado nunca casa (um segredo
 *   "não configurado" jamais é igual a um header vazio).
 */
export function timingSafeEqualString(
  received: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (typeof received !== 'string' || typeof expected !== 'string') return false
  if (!received || !expected) return false
  const a = createHash('sha256').update(received, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}
