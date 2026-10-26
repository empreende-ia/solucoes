/**
 * Formats a variable key for human-readable display
 */
export function formatVarKeyForHumans(key: string): string {
  const n = Number(key);
  if (Number.isFinite(n) && n > 0) return `${n}ª variável`;
  return `variável ${key}`;
}

/**
 * Gets suggested value for a variable slot based on the key name
 */
export function getSuggestedValueForSlot(key: string): string {
  const k = String(key || '').toLowerCase();
  if (k.includes('email')) return 'teste@exemplo.com';
  if (k.includes('empresa')) return 'Empresa Teste';
  return '';
}
