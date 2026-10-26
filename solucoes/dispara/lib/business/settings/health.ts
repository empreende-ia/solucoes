/**
 * Health Check Business Logic
 *
 * Pure functions for computing system health scores and detecting issues
 * based on application settings. Extracted from useSettings.ts for testability
 * and reusability.
 *
 * @module lib/business/settings/health
 */

import type { AppSettings } from '@/types'
import type { HealthServices } from '@/types/settings.types'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of a health check computation.
 */
export interface HealthCheckResult {
  /** Whether the system is considered healthy */
  isHealthy: boolean
  /** List of detected issues */
  issues: string[]
  /** Health score from 0-100 */
  score: number
}

/**
 * Severity level for health issues.
 */
export type HealthIssueSeverity = 'critical' | 'warning' | 'info'

/**
 * A detected health issue with severity and details.
 */
export interface HealthIssue {
  /** Unique identifier for the issue type */
  code: string
  /** Human-readable message */
  message: string
  /** Severity level */
  severity: HealthIssueSeverity
  /** Points to deduct from health score */
  scorePenalty: number
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Health score thresholds.
 */
export const HEALTH_THRESHOLDS = {
  /** Minimum score to be considered healthy */
  HEALTHY: 80,
  /** Minimum score to be considered degraded (below = unhealthy) */
  DEGRADED: 50,
} as const

/**
 * Score penalties for different issues.
 */
export const SCORE_PENALTIES = {
  /** Missing required credentials */
  MISSING_CREDENTIALS: 30,
  /** Disconnected state */
  DISCONNECTED: 40,
  /** Missing optional configuration */
  MISSING_OPTIONAL: 10,
  /** Low quality rating */
  LOW_QUALITY: 15,
  /** No test contact configured */
  NO_TEST_CONTACT: 5,
} as const

// =============================================================================
// ISSUE DETECTION
// =============================================================================

/**
 * Detects health issues in the application settings.
 *
 * @param settings - The application settings to analyze
 * @returns Array of detected health issues
 *
 * @example
 * ```typescript
 * const issues = getHealthIssues({
 *   phoneNumberId: '',
 *   businessAccountId: '',
 *   accessToken: '',
 *   isConnected: false
 * })
 * // Returns issues for missing credentials and disconnected state
 * ```
 */
export function getHealthIssues(settings: AppSettings): HealthIssue[] {
  const issues: HealthIssue[] = []

  // Check connection status
  if (!settings.isConnected) {
    issues.push({
      code: 'DISCONNECTED',
      message: 'WhatsApp API não está conectada',
      severity: 'critical',
      scorePenalty: SCORE_PENALTIES.DISCONNECTED,
    })
  }

  // Check required credentials
  if (!settings.phoneNumberId) {
    issues.push({
      code: 'MISSING_PHONE_NUMBER_ID',
      message: 'Phone Number ID não configurado',
      severity: 'critical',
      scorePenalty: SCORE_PENALTIES.MISSING_CREDENTIALS,
    })
  }

  if (!settings.businessAccountId) {
    issues.push({
      code: 'MISSING_BUSINESS_ACCOUNT_ID',
      message: 'Business Account ID (WABA) não configurado',
      severity: 'critical',
      scorePenalty: SCORE_PENALTIES.MISSING_CREDENTIALS,
    })
  }

  if (!settings.accessToken) {
    issues.push({
      code: 'MISSING_ACCESS_TOKEN',
      message: 'Access Token não configurado',
      severity: 'critical',
      scorePenalty: SCORE_PENALTIES.MISSING_CREDENTIALS,
    })
  }

  // Check quality rating (only if connected)
  if (settings.isConnected && settings.qualityRating) {
    const rating = settings.qualityRating.toUpperCase()
    if (rating === 'LOW' || rating === 'RED') {
      issues.push({
        code: 'LOW_QUALITY_RATING',
        message: `Quality rating está ${rating}`,
        severity: 'warning',
        scorePenalty: SCORE_PENALTIES.LOW_QUALITY,
      })
    }
  }

  // Check test contact (informational)
  if (!settings.testContact?.phone) {
    issues.push({
      code: 'NO_TEST_CONTACT',
      message: 'Nenhum contato de teste configurado',
      severity: 'info',
      scorePenalty: SCORE_PENALTIES.NO_TEST_CONTACT,
    })
  }

  return issues
}

/**
 * Gets only the issue messages as strings.
 *
 * @param settings - The application settings to analyze
 * @returns Array of issue message strings
 *
 * @example
 * ```typescript
 * const messages = getHealthIssueMessages(settings)
 * // ['WhatsApp API não está conectada', 'Phone Number ID não configurado']
 * ```
 */
export function getHealthIssueMessages(settings: AppSettings): string[] {
  return getHealthIssues(settings).map((issue) => issue.message)
}

// =============================================================================
// SCORE COMPUTATION
// =============================================================================

/**
 * Computes the health score from detected issues.
 *
 * @param issues - Array of detected health issues
 * @returns Health score from 0-100
 *
 * @example
 * ```typescript
 * const issues = getHealthIssues(settings)
 * const score = computeScoreFromIssues(issues)
 * // Returns 100 if no issues, reduced by penalties otherwise
 * ```
 */
export function computeScoreFromIssues(issues: HealthIssue[]): number {
  const totalPenalty = issues.reduce((sum, issue) => sum + issue.scorePenalty, 0)
  return Math.max(0, Math.min(100, 100 - totalPenalty))
}

/**
 * Computes a complete health check result from settings.
 *
 * @param settings - The application settings to analyze
 * @returns Complete health check result with score and issues
 *
 * @example
 * ```typescript
 * const result = computeHealthScore({
 *   phoneNumberId: '123',
 *   businessAccountId: '456',
 *   accessToken: 'token',
 *   isConnected: true
 * })
 * // { isHealthy: true, issues: [], score: 100 }
 * ```
 */
export function computeHealthScore(settings: AppSettings): HealthCheckResult {
  const detectedIssues = getHealthIssues(settings)
  const score = computeScoreFromIssues(detectedIssues)
  const isHealthy = score >= HEALTH_THRESHOLDS.HEALTHY

  return {
    isHealthy,
    issues: detectedIssues.map((issue) => issue.message),
    score,
  }
}

// =============================================================================
// STATUS DETERMINATION
// =============================================================================

/**
 * Determines the overall health status string from a score.
 *
 * @param score - Health score from 0-100
 * @returns Health status string
 *
 * @example
 * ```typescript
 * getHealthStatus(90) // 'healthy'
 * getHealthStatus(60) // 'degraded'
 * getHealthStatus(30) // 'unhealthy'
 * ```
 */
export function getHealthStatus(score: number): 'healthy' | 'degraded' | 'unhealthy' {
  if (score >= HEALTH_THRESHOLDS.HEALTHY) {
    return 'healthy'
  }
  if (score >= HEALTH_THRESHOLDS.DEGRADED) {
    return 'degraded'
  }
  return 'unhealthy'
}

/**
 * Checks if the system is ready for sending campaigns.
 *
 * @param settings - The application settings to check
 * @returns Whether the system can send campaigns and reason if not
 *
 * @example
 * ```typescript
 * const { canSend, reason } = canSendWithSettings(settings)
 * if (!canSend) {
 *   console.log('Cannot send:', reason)
 * }
 * ```
 */
export function canSendWithSettings(settings: AppSettings): {
  canSend: boolean
  reason?: string
} {
  if (!settings.isConnected) {
    return { canSend: false, reason: 'WhatsApp API não está conectada' }
  }

  if (!settings.phoneNumberId || !settings.accessToken) {
    return { canSend: false, reason: 'Credenciais não configuradas' }
  }

  // Check quality rating
  if (settings.qualityRating) {
    const rating = settings.qualityRating.toUpperCase()
    if (rating === 'RED') {
      return { canSend: false, reason: 'Quality rating está RED - envios bloqueados' }
    }
  }

  return { canSend: true }
}

// =============================================================================
// SERVICE HEALTH HELPERS
// =============================================================================

/**
 * Determines if all required services are healthy.
 *
 * @param services - Health services status object
 * @returns Whether all required services are operational
 *
 * @example
 * ```typescript
 * const healthy = areServicesHealthy(healthStatus.services)
 * ```
 */
export function areServicesHealthy(services: HealthServices): boolean {
  // Database should be ok (não pode estar em erro)
  if (services.database?.status === 'error') {
    return false
  }

  return true
}

/**
 * Gets the most critical service issue.
 *
 * @param services - Health services status object
 * @returns The most critical issue message or null if healthy
 *
 * @example
 * ```typescript
 * const issue = getCriticalServiceIssue(healthStatus.services)
 * if (issue) {
 *   toast.error(issue)
 * }
 * ```
 */
export function getCriticalServiceIssue(services: HealthServices): string | null {
  if (services.database?.status === 'error') {
    return services.database.message || 'Erro na conexão com banco de dados'
  }

  return null
}
