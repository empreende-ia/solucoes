/**
 * Date Formatter Utilities
 * 
 * Utilitários para formatação de datas que evitam hydration mismatch.
 * O problema: toLocaleString() pode retornar valores diferentes no servidor vs cliente.
 * 
 * Solução: Usar formatação determinística no servidor ou adiar formatação para o cliente.
 */

/**
 * Formata data de forma determinística (ISO) - seguro para SSR
 * Use quando precisar de um formato consistente server/client
 */
export function formatDateISO(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    return d.toISOString().split('T')[0] // YYYY-MM-DD
  } catch {
    return '—'
  }
}

/**
 * Formata data/hora de forma determinística - seguro para SSR
 */
export function formatDateTimeISO(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    // Formato: YYYY-MM-DD HH:mm
    return d.toISOString().replace('T', ' ').slice(0, 16)
  } catch {
    return '—'
  }
}

/**
 * Formata data em pt-BR - APENAS para uso client-side
 * Usar com suppressHydrationWarning ou dentro de useEffect
 */
export function formatDatePtBR(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

/**
 * Formata data/hora em pt-BR - APENAS para uso client-side
 * Usar com suppressHydrationWarning ou dentro de useEffect
 */
export function formatDateTimePtBR(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR')
  } catch {
    return '—'
  }
}

/**
 * Formata data/hora em pt-BR com opções customizadas
 */
export function formatDateTimePtBRCustom(
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR', options)
  } catch {
    return '—'
  }
}

/**
 * Formata tempo relativo (ex: "2min", "3h", "5d")
 * Determinístico baseado em timestamps - seguro para SSR
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    
    const now = Date.now()
    const diffMs = now - d.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'agora'
    if (diffMins < 60) return `${diffMins}min`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`

    // Fallback para data ISO (determinístico)
    return d.toISOString().split('T')[0]
  } catch {
    return '—'
  }
}

/**
 * Formata data para exibição curta: "25/01"
 * Determinístico - seguro para SSR
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  } catch {
    return '—'
  }
}

/**
 * Formata data para exibição completa: "25/01/2026"
 * Determinístico - seguro para SSR
 */
export function formatDateFull(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch {
    return '—'
  }
}

/**
 * Formata data/hora para exibição: "25/01/2026 14:30"
 * Determinístico - seguro para SSR
 */
export function formatDateTimeFull(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return '—'
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}`
  } catch {
    return '—'
  }
}
