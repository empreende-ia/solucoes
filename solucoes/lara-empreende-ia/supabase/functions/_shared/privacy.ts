const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_PATTERN = /\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|senha)\s*[:=]\s*[^\s,;]+/gi;
const SENSITIVE_KEY_PATTERN = /(password|senha|secret|token|authorization|api[_-]?key|cpf|cnpj|card|credit)/i;

export function redactSensitiveText(value: string, maxLength = 2_000): string {
  return value
    .slice(0, Math.max(maxLength, 0))
    .replace(BEARER_PATTERN, 'Bearer [credencial removida]')
    .replace(SECRET_PATTERN, '$1=[credencial removida]')
    .replace(EMAIL_PATTERN, '[e-mail removido]')
    .replace(CNPJ_PATTERN, '[documento removido]')
    .replace(CPF_PATTERN, '[documento removido]')
    .replace(PHONE_PATTERN, '[telefone removido]')
    .replace(CARD_PATTERN, '[dado financeiro removido]');
}

export function redactSensitiveValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[conteúdo truncado]';
  if (typeof value === 'string') return redactSensitiveText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactSensitiveValue(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 500);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[dado sensível removido]' : redactSensitiveValue(item, depth + 1),
    ]),
  );
}
