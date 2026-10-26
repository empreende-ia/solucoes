/**
 * Completa um JSON truncado no meio do streaming — fecha strings e colchetes
 * abertos e apara tokens pendentes — para a interface espiar a proposta enquanto
 * ela chega. O objeto resultante serve só à pré-visualização: o dado autoritativo
 * é o que o servidor parseia no evento final do stream.
 */

interface ScanState {
  inString: boolean;
  closers: string;
}

function scan(text: string): ScanState {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') stack.pop();
  }
  return { inString, closers: stack.reverse().join('') };
}

export function completePartialJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  const body = text.slice(start);
  // Cortes progressivos do fim resolvem truncamento no meio de número, literal
  // (tru/fal/nul) ou chave sem valor; 80 chars cobrem qualquer token do schema.
  const maxTrim = Math.min(80, body.length - 1);
  for (let trim = 0; trim <= maxTrim; trim += 1) {
    const slice = body.slice(0, body.length - trim);
    const { inString, closers } = scan(slice);
    let candidate = slice;
    if (inString) candidate += '"';
    const tail = candidate.replace(/\s+$/, '');
    if (tail.endsWith(',')) candidate = tail.slice(0, -1);
    else if (tail.endsWith(':')) candidate = `${tail}null`;
    try {
      return JSON.parse(candidate + closers);
    } catch {
      // Tenta um corte maior.
    }
  }
  return null;
}
