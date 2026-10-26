/**
 * Campaign Scheduling Rules
 *
 * Business rules and utilities for campaign scheduling.
 * Defines constraints for when campaigns can be scheduled.
 *
 * @module lib/business/campaign/scheduling
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Scheduling constraints for campaigns.
 */
export const SCHEDULING_RULES = {
  /** Minimum number of minutes in the future a campaign can be scheduled */
  MIN_FUTURE_MINUTES: 5,
  /** Maximum number of days in the future a campaign can be scheduled */
  MAX_FUTURE_DAYS: 30,
} as const

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of schedule date validation.
 */
export type ScheduleValidationResult = {
  /** Whether the date is valid for scheduling */
  valid: boolean
  /** Reason for invalidity (only present if valid is false) */
  reason?: string
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates if a date is acceptable for campaign scheduling.
 *
 * Rules enforced:
 * - Date must be at least MIN_FUTURE_MINUTES in the future
 * - Date must be at most MAX_FUTURE_DAYS in the future
 *
 * @param date - The proposed schedule date
 * @param referenceDate - Optional reference date for testing (defaults to now)
 * @returns Validation result with reason if invalid
 *
 * @example
 * ```ts
 * // Too soon
 * const twoMinutesFromNow = new Date(Date.now() + 2 * 60 * 1000)
 * isValidScheduleDate(twoMinutesFromNow)
 * // { valid: false, reason: 'Agendamento deve ser pelo menos 5 minutos no futuro' }
 *
 * // Too far
 * const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
 * isValidScheduleDate(sixtyDaysFromNow)
 * // { valid: false, reason: 'Agendamento nao pode exceder 30 dias no futuro' }
 *
 * // Valid
 * const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000)
 * isValidScheduleDate(tenMinutesFromNow)
 * // { valid: true }
 * ```
 */
export function isValidScheduleDate(
  date: Date,
  referenceDate: Date = new Date()
): ScheduleValidationResult {
  const scheduleTime = date.getTime()
  const referenceTime = referenceDate.getTime()

  // Check minimum future time
  const minTime = getMinScheduleDate(referenceDate).getTime()
  if (scheduleTime < minTime) {
    return {
      valid: false,
      reason: `Agendamento deve ser pelo menos ${SCHEDULING_RULES.MIN_FUTURE_MINUTES} minutos no futuro`,
    }
  }

  // Check maximum future time
  const maxTime = getMaxScheduleDate(referenceDate).getTime()
  if (scheduleTime > maxTime) {
    return {
      valid: false,
      reason: `Agendamento nao pode exceder ${SCHEDULING_RULES.MAX_FUTURE_DAYS} dias no futuro`,
    }
  }

  // Check if date is in the past
  if (scheduleTime < referenceTime) {
    return {
      valid: false,
      reason: 'Data de agendamento nao pode estar no passado',
    }
  }

  return { valid: true }
}

/**
 * Calculates the minimum allowed schedule date.
 *
 * @param referenceDate - Optional reference date (defaults to now)
 * @returns The earliest date a campaign can be scheduled
 *
 * @example
 * ```ts
 * const minDate = getMinScheduleDate()
 * // Date 5 minutes from now
 * ```
 */
export function getMinScheduleDate(referenceDate: Date = new Date()): Date {
  const minMs = SCHEDULING_RULES.MIN_FUTURE_MINUTES * 60 * 1000
  return new Date(referenceDate.getTime() + minMs)
}

/**
 * Calculates the maximum allowed schedule date.
 *
 * @param referenceDate - Optional reference date (defaults to now)
 * @returns The latest date a campaign can be scheduled
 *
 * @example
 * ```ts
 * const maxDate = getMaxScheduleDate()
 * // Date 30 days from now
 * ```
 */
export function getMaxScheduleDate(referenceDate: Date = new Date()): Date {
  const maxMs = SCHEDULING_RULES.MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000
  return new Date(referenceDate.getTime() + maxMs)
}

/**
 * Formats a date for display in schedule confirmations.
 *
 * @param date - Date to format
 * @param locale - Locale for formatting (defaults to pt-BR)
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * formatScheduleDate(new Date('2024-01-15T14:30:00'))
 * // '15 de jan. de 2024 as 14:30'
 * ```
 */
export function formatScheduleDate(date: Date, locale: string = 'pt-BR'): string {
  return date.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Parses an ISO string to Date, validating it's a valid schedule date.
 *
 * @param isoString - ISO date string to parse
 * @param referenceDate - Optional reference date for validation
 * @returns Parsed date if valid, null if invalid
 *
 * @example
 * ```ts
 * const date = parseScheduleDate('2024-01-15T14:30:00.000Z')
 * if (date) {
 *   // Valid schedule date
 * }
 * ```
 */
export function parseScheduleDate(
  isoString: string,
  referenceDate: Date = new Date()
): Date | null {
  const date = new Date(isoString)

  // Check if parsing resulted in valid date
  if (isNaN(date.getTime())) {
    return null
  }

  // Validate against scheduling rules
  const validation = isValidScheduleDate(date, referenceDate)
  if (!validation.valid) {
    return null
  }

  return date
}

/**
 * Creates a default schedule date suggestion.
 * Returns a date 1 hour from now, rounded to the nearest 15 minutes.
 *
 * @param referenceDate - Optional reference date (defaults to now)
 * @returns Suggested schedule date
 *
 * @example
 * ```ts
 * // If now is 14:07
 * getSuggestedScheduleDate()
 * // Returns Date for 15:15 (1 hour + rounded to 15 min)
 * ```
 */
export function getSuggestedScheduleDate(referenceDate: Date = new Date()): Date {
  const oneHourFromNow = new Date(referenceDate.getTime() + 60 * 60 * 1000)

  // Round to nearest 15 minutes
  const minutes = oneHourFromNow.getMinutes()
  const roundedMinutes = Math.ceil(minutes / 15) * 15

  oneHourFromNow.setMinutes(roundedMinutes, 0, 0)

  // Handle overflow to next hour
  if (roundedMinutes >= 60) {
    oneHourFromNow.setMinutes(0)
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1)
  }

  return oneHourFromNow
}
