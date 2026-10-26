/**
 * Settings Business Logic
 *
 * Pure functions for settings-related business logic including
 * health checks, webhook management, and calendar configuration.
 *
 * @module lib/business/settings
 *
 * @example
 * ```typescript
 * import {
 *   computeHealthScore,
 *   validateWebhookUrl,
 *   getAvailableSlots
 * } from '@/lib/business/settings'
 * ```
 */

// =============================================================================
// HEALTH CHECK
// =============================================================================

export {
  // Types
  type HealthCheckResult,
  type HealthIssueSeverity,
  type HealthIssue,
  // Constants
  HEALTH_THRESHOLDS,
  SCORE_PENALTIES,
  // Issue detection
  getHealthIssues,
  getHealthIssueMessages,
  // Score computation
  computeScoreFromIssues,
  computeHealthScore,
  // Status determination
  getHealthStatus,
  canSendWithSettings,
  // Service health
  areServicesHealthy,
  getCriticalServiceIssue,
} from './health'

// =============================================================================
// WEBHOOK
// =============================================================================

export {
  // Types
  type WebhookValidationResult,
  type WebhookUrlComponents,
  // Constants
  DEFAULT_WEBHOOK_PATH,
  MIN_URL_LENGTH,
  MAX_URL_LENGTH,
  TOKEN_PARAM_NAME,
  // Validation
  validateWebhookUrl,
  validateWebhookToken,
  // URL construction
  buildWebhookUrl,
  buildCallbackUrl,
  // URL parsing
  parseWebhookToken,
  parseWebhookUrl,
  extractBaseUrl,
  // Domain helpers
  normalizeDomain,
  isProductionUrl,
} from './webhook'

// =============================================================================
// CALENDAR
// =============================================================================

export {
  // Types
  type WorkingHours,
  type CalendarConfig,
  type CalendarValidationResult,
  type TimeValidationResult,
  // Constants
  DEFAULT_WORKING_HOURS,
  MIN_SLOT_DURATION,
  MAX_SLOT_DURATION,
  DEFAULT_SLOT_DURATION,
  WEEKDAY_ORDER,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT_LABELS,
  // Time parsing
  parseTimeToMinutes,
  minutesToTime,
  validateTimeFormat,
  // Working hours validation
  validateWorkingHours,
  validateWorkingHoursDay,
  // Calendar config validation
  validateCalendarConfig,
  validateCalendarBookingConfig,
  // Time checking
  isWithinWorkingHours,
  isWorkingDay,
  getWorkingHoursForDate,
  // Slot generation
  getAvailableSlots,
  getAvailableSlotsForDate,
  countSlotsInDay,
} from './calendar'
