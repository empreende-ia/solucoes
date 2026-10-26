/**
 * Utility functions for input validation and type coercion.
 * Extracted to avoid duplication across API routes.
 */

/**
 * Clamps a value to an integer within a specified range.
 * Returns `min` (or optional `fallback`) if the value is not a finite number.
 *
 * @param n - The value to clamp (can be any type)
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fallback - Optional fallback value (defaults to min)
 * @returns Clamped integer value
 *
 * @example
 * clampInt('50', 0, 100) // 50
 * clampInt('150', 0, 100) // 100
 * clampInt('invalid', 0, 100) // 0
 * clampInt(null, 0, 100, 50) // 50
 */
export function clampInt(n: unknown, min: number, max: number, fallback?: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback ?? min
  return Math.min(max, Math.max(min, Math.floor(v)))
}

/**
 * Converts an unknown value to a boolean.
 * Handles strings like '1', 'true', 'on' (case-insensitive).
 *
 * @param v - The value to convert
 * @param fallback - Value to return if conversion fails (defaults to false)
 * @returns Boolean representation of the value
 *
 * @example
 * boolFromUnknown(true) // true
 * boolFromUnknown('true') // true
 * boolFromUnknown('1') // true
 * boolFromUnknown('on') // true
 * boolFromUnknown(1) // true
 * boolFromUnknown('false') // false
 * boolFromUnknown(null) // false
 */
export function boolFromUnknown(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const lower = v.toLowerCase()
    return v === '1' || lower === 'true' || lower === 'on'
  }
  if (typeof v === 'number') return v === 1
  return fallback
}

/**
 * Parses a string to integer with optional default.
 * Returns the default if parsing fails or result is NaN.
 *
 * @param value - String value to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed integer or default
 */
export function parseIntOrDefault(value: string | null | undefined, defaultValue: number): number {
  if (value === null || value === undefined) return defaultValue
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

/**
 * Parses a string to float with optional default.
 * Returns the default if parsing fails or result is NaN.
 *
 * @param value - String value to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed float or default
 */
export function parseFloatOrDefault(value: string | null | undefined, defaultValue: number): number {
  if (value === null || value === undefined) return defaultValue
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? defaultValue : parsed
}
