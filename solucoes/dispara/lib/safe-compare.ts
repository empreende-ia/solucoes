import { createHash, timingSafeEqual } from 'crypto'

/**
 * Comparação de segredos em tempo constante.
 *
 * Os dois lados passam por SHA-256 antes do timingSafeEqual: assim os buffers
 * comparados têm sempre o mesmo tamanho e nem o comprimento do segredo vaza
 * por timing (o timingSafeEqual cru lança erro com tamanhos diferentes, e o
 * atalho `a.length !== b.length` denuncia o tamanho).
 *
 * Strings vazias nunca casam (segredo não configurado não pode virar "aceita tudo").
 */
export function timingSafeEqualString(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length === 0 || b.length === 0) return false
  const da = createHash('sha256').update(a, 'utf8').digest()
  const db = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(da, db)
}
