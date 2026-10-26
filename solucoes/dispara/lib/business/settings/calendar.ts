/**
 * Calendar Configuration Business Logic
 *
 * Pure functions for calendar configuration validation, working hours
 * calculations, and slot availability. Extracted for testability and reusability.
 *
 * @module lib/business/settings/calendar
 */

import type { Weekday, WorkingHoursDay, CalendarBookingConfig } from '@/types'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Simple working hours representation.
 */
export interface WorkingHours {
  /** Start time in HH:mm format */
  start: string
  /** End time in HH:mm format */
  end: string
}

/**
 * Calendar configuration for validation.
 */
export interface CalendarConfig {
  /** Whether calendar booking is enabled */
  enabled: boolean
  /** Google Calendar ID */
  calendarId?: string
  /** Working hours per day */
  workingHours: WorkingHours
  /** Slot duration in minutes */
  slotDuration: number
}

/**
 * Result of calendar configuration validation.
 */
export interface CalendarValidationResult {
  /** Whether the configuration is valid */
  valid: boolean
  /** Array of validation error messages */
  errors: string[]
}

/**
 * Result of time validation.
 */
export interface TimeValidationResult {
  /** Whether the time is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default working hours.
 */
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: '09:00',
  end: '18:00',
}

/**
 * Minimum slot duration in minutes.
 */
export const MIN_SLOT_DURATION = 15

/**
 * Maximum slot duration in minutes.
 */
export const MAX_SLOT_DURATION = 240

/**
 * Default slot duration in minutes.
 */
export const DEFAULT_SLOT_DURATION = 30

/**
 * Weekday order for sorting.
 */
export const WEEKDAY_ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/**
 * Weekday labels in Portuguese.
 */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Segunda',
  tue: 'Terca',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sabado',
  sun: 'Domingo',
}

/**
 * Short weekday labels in Portuguese.
 */
export const WEEKDAY_SHORT_LABELS: Record<Weekday, string> = {
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sab',
  sun: 'Dom',
}

// =============================================================================
// TIME PARSING
// =============================================================================

/**
 * Parses a time string (HH:mm) to minutes since midnight.
 *
 * @param time - Time string in HH:mm format
 * @returns Minutes since midnight, or null if invalid
 *
 * @example
 * ```typescript
 * parseTimeToMinutes('09:00') // 540
 * parseTimeToMinutes('18:30') // 1110
 * parseTimeToMinutes('invalid') // null
 * ```
 */
export function parseTimeToMinutes(time: string): number | null {
  if (!time || typeof time !== 'string') {
    return null
  }

  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }

  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }

  return hours * 60 + minutes
}

/**
 * Converts minutes since midnight to HH:mm format.
 *
 * @param minutes - Minutes since midnight
 * @returns Time string in HH:mm format
 *
 * @example
 * ```typescript
 * minutesToTime(540) // '09:00'
 * minutesToTime(1110) // '18:30'
 * ```
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Validates a time string format.
 *
 * @param time - Time string to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateTimeFormat('09:00') // { valid: true }
 * validateTimeFormat('25:00') // { valid: false, error: 'Hora invalida' }
 * ```
 */
export function validateTimeFormat(time: string): TimeValidationResult {
  const minutes = parseTimeToMinutes(time)

  if (minutes === null) {
    return { valid: false, error: 'Formato de hora invalido (use HH:mm)' }
  }

  return { valid: true }
}

// =============================================================================
// WORKING HOURS VALIDATION
// =============================================================================

/**
 * Validates working hours configuration.
 *
 * @param workingHours - Working hours to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateWorkingHours({ start: '09:00', end: '18:00' })
 * // { valid: true, errors: [] }
 *
 * validateWorkingHours({ start: '18:00', end: '09:00' })
 * // { valid: false, errors: ['Hora de inicio deve ser anterior a hora de fim'] }
 * ```
 */
export function validateWorkingHours(workingHours: WorkingHours): CalendarValidationResult {
  const errors: string[] = []

  // Validate start time format
  const startMinutes = parseTimeToMinutes(workingHours.start)
  if (startMinutes === null) {
    errors.push('Hora de inicio invalida')
  }

  // Validate end time format
  const endMinutes = parseTimeToMinutes(workingHours.end)
  if (endMinutes === null) {
    errors.push('Hora de fim invalida')
  }

  // Check that start is before end
  if (startMinutes !== null && endMinutes !== null) {
    if (startMinutes >= endMinutes) {
      errors.push('Hora de inicio deve ser anterior a hora de fim')
    }

    // Check minimum working period (at least 30 minutes)
    if (endMinutes - startMinutes < 30) {
      errors.push('Periodo de trabalho deve ter pelo menos 30 minutos')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates a full day's working hours configuration.
 *
 * @param day - The working hours day configuration
 * @returns Validation result
 */
export function validateWorkingHoursDay(day: WorkingHoursDay): CalendarValidationResult {
  // If day is disabled, no validation needed
  if (!day.enabled) {
    return { valid: true, errors: [] }
  }

  return validateWorkingHours({ start: day.start, end: day.end })
}

// =============================================================================
// CALENDAR CONFIG VALIDATION
// =============================================================================

/**
 * Validates a complete calendar configuration.
 *
 * @param config - The calendar configuration to validate
 * @returns Validation result with all errors
 *
 * @example
 * ```typescript
 * validateCalendarConfig({
 *   enabled: true,
 *   calendarId: 'primary',
 *   workingHours: { start: '09:00', end: '18:00' },
 *   slotDuration: 30
 * })
 * // { valid: true, errors: [] }
 * ```
 */
export function validateCalendarConfig(config: CalendarConfig): CalendarValidationResult {
  const errors: string[] = []

  // If not enabled, minimal validation
  if (!config.enabled) {
    return { valid: true, errors: [] }
  }

  // Validate calendar ID when enabled
  if (!config.calendarId) {
    errors.push('ID do calendario e obrigatorio quando habilitado')
  }

  // Validate slot duration
  if (config.slotDuration < MIN_SLOT_DURATION) {
    errors.push(`Duracao do slot deve ser pelo menos ${MIN_SLOT_DURATION} minutos`)
  }

  if (config.slotDuration > MAX_SLOT_DURATION) {
    errors.push(`Duracao do slot deve ser no maximo ${MAX_SLOT_DURATION} minutos`)
  }

  // Validate working hours
  const hoursValidation = validateWorkingHours(config.workingHours)
  errors.push(...hoursValidation.errors)

  // Check that slot fits in working hours
  if (hoursValidation.valid) {
    const startMinutes = parseTimeToMinutes(config.workingHours.start)!
    const endMinutes = parseTimeToMinutes(config.workingHours.end)!
    const workingMinutes = endMinutes - startMinutes

    if (config.slotDuration > workingMinutes) {
      errors.push('Duracao do slot e maior que o periodo de trabalho')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates a full CalendarBookingConfig.
 *
 * @param config - The booking configuration to validate
 * @returns Validation result
 */
export function validateCalendarBookingConfig(
  config: CalendarBookingConfig
): CalendarValidationResult {
  const errors: string[] = []

  // Validate slot duration
  if (config.slotDurationMinutes < MIN_SLOT_DURATION) {
    errors.push(`Duracao do slot deve ser pelo menos ${MIN_SLOT_DURATION} minutos`)
  }

  if (config.slotDurationMinutes > MAX_SLOT_DURATION) {
    errors.push(`Duracao do slot deve ser no maximo ${MAX_SLOT_DURATION} minutos`)
  }

  // Validate buffer
  if (config.slotBufferMinutes < 0) {
    errors.push('Buffer entre slots nao pode ser negativo')
  }

  if (config.slotBufferMinutes > 60) {
    errors.push('Buffer entre slots muito longo (maximo 60 minutos)')
  }

  // Validate each working day
  for (const day of config.workingHours) {
    const dayValidation = validateWorkingHoursDay(day)
    if (!dayValidation.valid) {
      const label = WEEKDAY_LABELS[day.day] || day.day
      errors.push(...dayValidation.errors.map((e) => `${label}: ${e}`))
    }
  }

  // Check that at least one day is enabled
  const hasEnabledDay = config.workingHours.some((d) => d.enabled)
  if (!hasEnabledDay) {
    errors.push('Pelo menos um dia deve estar habilitado')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// =============================================================================
// TIME CHECKING
// =============================================================================

/**
 * Checks if a given time is within working hours.
 *
 * @param time - The time to check (Date object)
 * @param workingHours - The working hours configuration
 * @returns Whether the time is within working hours
 *
 * @example
 * ```typescript
 * const time = new Date('2024-01-15T10:30:00')
 * isWithinWorkingHours(time, { start: '09:00', end: '18:00' })
 * // true
 * ```
 */
export function isWithinWorkingHours(time: Date, workingHours: WorkingHours): boolean {
  const startMinutes = parseTimeToMinutes(workingHours.start)
  const endMinutes = parseTimeToMinutes(workingHours.end)

  if (startMinutes === null || endMinutes === null) {
    return false
  }

  const timeMinutes = time.getHours() * 60 + time.getMinutes()

  return timeMinutes >= startMinutes && timeMinutes < endMinutes
}

/**
 * Checks if a given date is on a working day.
 *
 * @param date - The date to check
 * @param workingDays - Array of working day configurations
 * @returns Whether the date is on an enabled working day
 */
export function isWorkingDay(date: Date, workingDays: WorkingHoursDay[]): boolean {
  const dayIndex = date.getDay() // 0 = Sunday
  const weekdayMap: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const weekday = weekdayMap[dayIndex]

  const dayConfig = workingDays.find((d) => d.day === weekday)
  return dayConfig?.enabled ?? false
}

/**
 * Gets the working hours for a specific date.
 *
 * @param date - The date to get working hours for
 * @param workingDays - Array of working day configurations
 * @returns Working hours for that day, or null if not a working day
 */
export function getWorkingHoursForDate(
  date: Date,
  workingDays: WorkingHoursDay[]
): WorkingHours | null {
  const dayIndex = date.getDay()
  const weekdayMap: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const weekday = weekdayMap[dayIndex]

  const dayConfig = workingDays.find((d) => d.day === weekday)

  if (!dayConfig?.enabled) {
    return null
  }

  return { start: dayConfig.start, end: dayConfig.end }
}

// =============================================================================
// SLOT GENERATION
// =============================================================================

/**
 * Generates available time slots for a given date.
 *
 * @param date - The date to generate slots for
 * @param workingHours - Working hours configuration
 * @param slotDuration - Duration of each slot in minutes
 * @param bookedSlots - Array of already booked slot times
 * @param bufferMinutes - Buffer time between slots (default 0)
 * @returns Array of available slot start times
 *
 * @example
 * ```typescript
 * const date = new Date('2024-01-15')
 * const slots = getAvailableSlots(
 *   date,
 *   { start: '09:00', end: '12:00' },
 *   30,
 *   []
 * )
 * // Returns dates for 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
 * ```
 */
export function getAvailableSlots(
  date: Date,
  workingHours: WorkingHours,
  slotDuration: number,
  bookedSlots: Date[],
  bufferMinutes: number = 0
): Date[] {
  const startMinutes = parseTimeToMinutes(workingHours.start)
  const endMinutes = parseTimeToMinutes(workingHours.end)

  if (startMinutes === null || endMinutes === null) {
    return []
  }

  const slots: Date[] = []
  const effectiveSlotDuration = slotDuration + bufferMinutes

  // Generate all possible slots
  for (let minutes = startMinutes; minutes + slotDuration <= endMinutes; minutes += effectiveSlotDuration) {
    const slotDate = new Date(date)
    slotDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)

    // Check if this slot is already booked
    const isBooked = bookedSlots.some((booked) => {
      return (
        booked.getFullYear() === slotDate.getFullYear() &&
        booked.getMonth() === slotDate.getMonth() &&
        booked.getDate() === slotDate.getDate() &&
        booked.getHours() === slotDate.getHours() &&
        booked.getMinutes() === slotDate.getMinutes()
      )
    })

    if (!isBooked) {
      slots.push(slotDate)
    }
  }

  return slots
}

/**
 * Gets all available slots for a date using full booking config.
 *
 * @param date - The date to get slots for
 * @param config - The calendar booking configuration
 * @param bookedSlots - Array of already booked slot times
 * @returns Array of available slot start times
 */
export function getAvailableSlotsForDate(
  date: Date,
  config: CalendarBookingConfig,
  bookedSlots: Date[]
): Date[] {
  const workingHours = getWorkingHoursForDate(date, config.workingHours)

  if (!workingHours) {
    return []
  }

  return getAvailableSlots(
    date,
    workingHours,
    config.slotDurationMinutes,
    bookedSlots,
    config.slotBufferMinutes
  )
}

/**
 * Calculates the number of available slots in a day.
 *
 * @param workingHours - Working hours configuration
 * @param slotDuration - Duration of each slot in minutes
 * @param bufferMinutes - Buffer between slots
 * @returns Number of possible slots
 */
export function countSlotsInDay(
  workingHours: WorkingHours,
  slotDuration: number,
  bufferMinutes: number = 0
): number {
  const startMinutes = parseTimeToMinutes(workingHours.start)
  const endMinutes = parseTimeToMinutes(workingHours.end)

  if (startMinutes === null || endMinutes === null) {
    return 0
  }

  const workingMinutes = endMinutes - startMinutes
  const effectiveSlotDuration = slotDuration + bufferMinutes

  return Math.floor(workingMinutes / effectiveSlotDuration)
}
