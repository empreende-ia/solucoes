/**
 * Utilitários leves para formatação de data
 * Substitui date-fns em client components para reduzir bundle size (~70KB economia)
 */

/**
 * Formata data para exibir hora no formato HH:mm
 * Equivalente a: format(date, 'HH:mm', { locale: ptBR })
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return ''

  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''

  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')

  return `${hours}:${minutes}`
}

/**
 * Formata data relativa em português (ex: "há 2 horas")
 * Equivalente a: formatDistanceToNow(date, { addSuffix: true, locale: ptBR })
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return ''

  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''

  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  // Futuro
  if (diffMs < 0) {
    return 'em breve'
  }

  // Menos de 1 minuto
  if (diffSeconds < 60) {
    return 'agora'
  }

  // Minutos
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? 'há 1 minuto' : `há ${diffMinutes} minutos`
  }

  // Horas
  if (diffHours < 24) {
    return diffHours === 1 ? 'há 1 hora' : `há ${diffHours} horas`
  }

  // Dias
  if (diffDays < 7) {
    return diffDays === 1 ? 'há 1 dia' : `há ${diffDays} dias`
  }

  // Semanas
  if (diffWeeks < 4) {
    return diffWeeks === 1 ? 'há 1 semana' : `há ${diffWeeks} semanas`
  }

  // Meses
  if (diffMonths < 12) {
    return diffMonths === 1 ? 'há 1 mês' : `há ${diffMonths} meses`
  }

  // Anos
  const diffYears = Math.floor(diffMonths / 12)
  return diffYears === 1 ? 'há 1 ano' : `há ${diffYears} anos`
}

/**
 * Formata data curta em português (ex: "14 jan", "hoje", "ontem")
 */
export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return ''

  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (dateOnly.getTime() === today.getTime()) {
    return 'hoje'
  }

  if (dateOnly.getTime() === yesterday.getTime()) {
    return 'ontem'
  }

  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${d.getDate()} ${months[d.getMonth()]}`
}
