/**
 * Chave de idempotência das ações do runtime.
 *
 * A chave antiga era `${mensagem}:${ação}` — sem os argumentos. Duas chamadas
 * legítimas da MESMA ferramenta na mesma mensagem ("pode ser terça 10h ou
 * quarta 14h?") colidiam, e a segunda recebia o replay do resultado da
 * primeira: a Lara respondia sobre quarta com o dado de terça. Incluir um
 * hash estável dos argumentos separa chamadas diferentes e continua colando
 * retries idênticos (mesma mensagem + mesma ação + mesmo input).
 */

/** Serialização estável: chaves de objeto em ordem, para o hash não variar. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/** FNV-1a 32 bits — determinístico, síncrono e suficiente para desambiguar inputs. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildIdempotencyKey(
  sourceMessageId: string,
  actionKey: string,
  input: Record<string, unknown>,
): string {
  return `${sourceMessageId}:${actionKey}:${fnv1a(stableStringify(input))}`;
}
