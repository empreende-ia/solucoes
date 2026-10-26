/**
 * Webhook URL Business Logic
 *
 * Pure functions for webhook URL validation, construction, and parsing.
 * Extracted from useSettings.ts for testability and reusability.
 *
 * @module lib/business/settings/webhook
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of webhook URL validation.
 */
export interface WebhookValidationResult {
  /** Whether the URL is valid */
  isValid: boolean
  /** Error message if invalid */
  error?: string
}

/**
 * Components of a webhook URL.
 */
export interface WebhookUrlComponents {
  /** Base URL (protocol + host) */
  baseUrl: string
  /** Path segment */
  path: string
  /** Phone Number ID if present in URL */
  phoneNumberId?: string
  /** Token if present as query param */
  token?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default webhook path.
 */
export const DEFAULT_WEBHOOK_PATH = '/api/webhook' as const

/**
 * Minimum URL length for validation.
 */
export const MIN_URL_LENGTH = 10

/**
 * Maximum URL length for validation.
 */
export const MAX_URL_LENGTH = 2048

/**
 * Token query parameter name.
 */
export const TOKEN_PARAM_NAME = 'token'

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validates a webhook URL.
 *
 * @param url - The URL to validate
 * @returns Validation result with isValid and optional error
 *
 * @example
 * ```typescript
 * validateWebhookUrl('https://example.com/api/webhook')
 * // { isValid: true }
 *
 * validateWebhookUrl('not-a-url')
 * // { isValid: false, error: 'URL inválida' }
 * ```
 */
export function validateWebhookUrl(url: string): WebhookValidationResult {
  // Check for empty/null
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL é obrigatória' }
  }

  const trimmedUrl = url.trim()

  // Check length
  if (trimmedUrl.length < MIN_URL_LENGTH) {
    return { isValid: false, error: 'URL muito curta' }
  }

  if (trimmedUrl.length > MAX_URL_LENGTH) {
    return { isValid: false, error: 'URL muito longa' }
  }

  // Check protocol
  if (!trimmedUrl.startsWith('https://')) {
    if (trimmedUrl.startsWith('http://')) {
      return { isValid: false, error: 'URL deve usar HTTPS' }
    }
    return { isValid: false, error: 'URL deve começar com https://' }
  }

  // Try to parse as URL
  try {
    const parsed = new URL(trimmedUrl)

    // Check for valid hostname
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { isValid: false, error: 'Hostname inválido' }
    }

    // Check for localhost (warning but valid in dev)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return {
        isValid: true,
        error: 'Atenção: localhost não funcionará em produção',
      }
    }

    return { isValid: true }
  } catch {
    return { isValid: false, error: 'URL inválida' }
  }
}

/**
 * Validates a webhook token.
 *
 * @param token - The token to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateWebhookToken('abc123')
 * // { isValid: true }
 *
 * validateWebhookToken('')
 * // { isValid: false, error: 'Token é obrigatório' }
 * ```
 */
export function validateWebhookToken(token: string): WebhookValidationResult {
  if (!token || typeof token !== 'string') {
    return { isValid: false, error: 'Token é obrigatório' }
  }

  const trimmed = token.trim()

  if (trimmed.length < 8) {
    return { isValid: false, error: 'Token deve ter pelo menos 8 caracteres' }
  }

  if (trimmed.length > 256) {
    return { isValid: false, error: 'Token muito longo' }
  }

  // Check for invalid characters
  if (!/^[\w\-._~]+$/.test(trimmed)) {
    return { isValid: false, error: 'Token contém caracteres inválidos' }
  }

  return { isValid: true }
}

// =============================================================================
// URL CONSTRUCTION
// =============================================================================

/**
 * Builds a webhook URL from components.
 *
 * @param baseUrl - The base URL (protocol + host)
 * @param phoneNumberId - The phone number ID (optional)
 * @param token - The verification token (optional)
 * @param path - The webhook path (defaults to /api/webhook)
 * @returns The constructed webhook URL
 *
 * @example
 * ```typescript
 * buildWebhookUrl('https://example.com', '123456', 'mytoken')
 * // 'https://example.com/api/webhook?token=mytoken'
 *
 * buildWebhookUrl('https://example.com', '123456')
 * // 'https://example.com/api/webhook'
 * ```
 */
export function buildWebhookUrl(
  baseUrl: string,
  phoneNumberId?: string,
  token?: string,
  path: string = DEFAULT_WEBHOOK_PATH
): string {
  // Normalize base URL
  const normalizedBase = baseUrl.replace(/\/+$/, '')

  // Build path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  // Start with base + path
  let url = `${normalizedBase}${normalizedPath}`

  // Add token as query param if provided
  if (token) {
    const separator = url.includes('?') ? '&' : '?'
    url = `${url}${separator}${TOKEN_PARAM_NAME}=${encodeURIComponent(token)}`
  }

  return url
}

/**
 * Builds the redirect/callback URL for OAuth flows.
 *
 * @param baseUrl - The base URL
 * @param callbackPath - The callback path
 * @returns The callback URL
 *
 * @example
 * ```typescript
 * buildCallbackUrl('https://example.com', '/api/auth/callback')
 * // 'https://example.com/api/auth/callback'
 * ```
 */
export function buildCallbackUrl(baseUrl: string, callbackPath: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedPath = callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`
  return `${normalizedBase}${normalizedPath}`
}

// =============================================================================
// URL PARSING
// =============================================================================

/**
 * Parses a webhook token from a URL.
 *
 * @param webhookUrl - The webhook URL to parse
 * @returns The extracted token or null if not found
 *
 * @example
 * ```typescript
 * parseWebhookToken('https://example.com/api/webhook?token=abc123')
 * // 'abc123'
 *
 * parseWebhookToken('https://example.com/api/webhook')
 * // null
 * ```
 */
export function parseWebhookToken(webhookUrl: string): string | null {
  if (!webhookUrl) {
    return null
  }

  try {
    const url = new URL(webhookUrl)
    const token = url.searchParams.get(TOKEN_PARAM_NAME)
    return token || null
  } catch {
    // Try manual parsing as fallback
    const match = webhookUrl.match(/[?&]token=([^&]+)/)
    return match ? decodeURIComponent(match[1]) : null
  }
}

/**
 * Parses all components from a webhook URL.
 *
 * @param webhookUrl - The webhook URL to parse
 * @returns Parsed URL components or null if invalid
 *
 * @example
 * ```typescript
 * parseWebhookUrl('https://example.com/api/webhook?token=abc123')
 * // { baseUrl: 'https://example.com', path: '/api/webhook', token: 'abc123' }
 * ```
 */
export function parseWebhookUrl(webhookUrl: string): WebhookUrlComponents | null {
  if (!webhookUrl) {
    return null
  }

  try {
    const url = new URL(webhookUrl)

    return {
      baseUrl: `${url.protocol}//${url.host}`,
      path: url.pathname,
      token: url.searchParams.get(TOKEN_PARAM_NAME) || undefined,
    }
  } catch {
    return null
  }
}

/**
 * Extracts the base URL (without path) from a full URL.
 *
 * @param fullUrl - The full URL
 * @returns The base URL or null if invalid
 *
 * @example
 * ```typescript
 * extractBaseUrl('https://example.com/api/webhook')
 * // 'https://example.com'
 * ```
 */
export function extractBaseUrl(fullUrl: string): string | null {
  try {
    const url = new URL(fullUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

// =============================================================================
// DOMAIN HELPERS
// =============================================================================

/**
 * Normalizes a domain/URL by ensuring HTTPS and removing trailing slashes.
 *
 * @param input - The domain or URL to normalize
 * @returns Normalized URL
 *
 * @example
 * ```typescript
 * normalizeDomain('example.com/')
 * // 'https://example.com'
 *
 * normalizeDomain('http://example.com')
 * // 'https://example.com'
 * ```
 */
export function normalizeDomain(input: string): string {
  if (!input) return ''

  let normalized = input.trim()

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '')

  // Add protocol if missing
  if (!normalized.includes('://')) {
    normalized = `https://${normalized}`
  }

  // Force HTTPS
  normalized = normalized.replace(/^http:\/\//, 'https://')

  return normalized
}

/**
 * Checks if a URL is a valid production URL (not localhost).
 *
 * @param url - The URL to check
 * @returns Whether it's a production-ready URL
 *
 * @example
 * ```typescript
 * isProductionUrl('https://example.com')
 * // true
 *
 * isProductionUrl('https://localhost:3000')
 * // false
 * ```
 */
export function isProductionUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()

    // Check for localhost variants
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local')
    ) {
      return false
    }

    // Check for development domains
    if (hostname.includes('.test') || hostname.includes('.dev.')) {
      return false
    }

    return true
  } catch {
    return false
  }
}
