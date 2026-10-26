import type { TemplateCategory } from '@/types'

const normalizeToken = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    // remove acentos/diacríticos (AUTENTICAÇÃO -> AUTENTICACAO)
    .normalize('NFD')
    // eslint-disable-next-line no-control-regex
    .replace(/\p{Diacritic}/gu, '')

/**
 * Converte categorias vindas da Meta/Supabase/legados para o formato canônico do app.
 *
 * Meta / Cloud API:
 * - UTILITY -> UTILIDADE
 * - AUTHENTICATION -> AUTENTICACAO
 * - MARKETING -> MARKETING
 */
export function canonicalTemplateCategory(v: unknown): TemplateCategory {
  const raw = normalizeToken(v)

  // Meta / WhatsApp Cloud API
  if (raw === 'UTILITY') return 'UTILIDADE'
  if (raw === 'AUTHENTICATION') return 'AUTENTICACAO'

  // Alguns providers legados
  if (raw === 'TRANSACTIONAL') return 'UTILIDADE'

  // Já no nosso formato
  if (raw === 'MARKETING') return 'MARKETING'
  if (raw === 'UTILIDADE') return 'UTILIDADE'
  if (raw === 'AUTENTICACAO') return 'AUTENTICACAO'

  // Fallback seguro (evita quebrar UI/filtros por categoria inesperada)
  return 'MARKETING'
}
