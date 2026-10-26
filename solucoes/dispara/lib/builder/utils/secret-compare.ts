import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara um segredo recebido (header) com o esperado em TEMPO CONSTANTE.
 *
 * Os dois lados passam por SHA-256 antes do timingSafeEqual: assim os buffers
 * têm sempre o mesmo tamanho (timingSafeEqual lança com tamanhos diferentes) e
 * o tempo não vaza nem o conteúdo nem o comprimento do segredo esperado.
 */
export function safeSecretEqual(
  provided: string | null | undefined,
  expected: string
): boolean {
  if (typeof provided !== "string" || provided.length === 0) {
    return false;
  }
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}
