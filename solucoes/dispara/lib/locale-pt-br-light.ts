/**
 * Lightweight Brazilian Portuguese locale for react-day-picker
 *
 * This is a minimal implementation that doesn't require the full date-fns/locale package,
 * saving ~15-20KB from the bundle. It only includes what react-day-picker needs.
 */

// Minimal locale implementation compatible with react-day-picker
export const ptBRLight = {
  code: 'pt-BR',
  localize: {
    day: (n: number) => ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][n],
    month: (n: number) => [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ][n],
    ordinalNumber: (n: number) => `${n}º`,
    era: () => '',
    quarter: () => '',
    dayPeriod: () => '',
  },
  formatLong: {
    date: () => 'dd/MM/yyyy',
    time: () => 'HH:mm',
    dateTime: () => 'dd/MM/yyyy HH:mm',
  },
  match: {
    ordinalNumber: () => ({ value: 0, rest: '' }),
    era: () => null,
    quarter: () => null,
    month: () => null,
    day: () => null,
    dayPeriod: () => null,
  },
  options: {
    weekStartsOn: 0 as const,
    firstWeekContainsDate: 1 as const,
  },
}

// Type-safe export
export type LocalePtBRLight = typeof ptBRLight
