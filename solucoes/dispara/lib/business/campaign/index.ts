/**
 * Campaign Business Logic Module
 *
 * Centralized business rules and validation for campaign management.
 * This module provides pure functions for campaign validation,
 * contact eligibility, send validation, and scheduling.
 *
 * @module lib/business/campaign
 *
 * @example
 * ```ts
 * import {
 *   CAMPAIGN_RULES,
 *   validateCampaignName,
 *   canContactReceiveCampaign,
 *   validateCampaignForSend,
 *   isValidScheduleDate,
 * } from '@/lib/business/campaign'
 *
 * // Validate campaign name
 * const nameError = validateCampaignName('AB')
 * if (nameError) {
 *   console.error(nameError.message)
 * }
 *
 * // Check contact eligibility
 * const suppressed = new Set(['5511999999999'])
 * const result = canContactReceiveCampaign(contact, suppressed)
 * if (!result.eligible) {
 *   console.log(`Excluded: ${result.reason}`)
 * }
 *
 * // Validate before sending
 * const validation = validateCampaignForSend(campaignData)
 * if (!validation.valid) {
 *   validation.errors.forEach(e => console.error(e.message))
 * }
 *
 * // Check schedule date
 * const scheduleResult = isValidScheduleDate(new Date('2024-01-15T14:30:00'))
 * if (!scheduleResult.valid) {
 *   console.error(scheduleResult.reason)
 * }
 * ```
 */

// =============================================================================
// RULES
// =============================================================================

export {
  // Constants
  CAMPAIGN_RULES,
  // Types
  type CampaignValidationError,
  type ContactEligibilityResult,
  // Functions
  validateCampaignName,
  canContactReceiveCampaign,
  validateRecipientCount,
} from './rules'

// =============================================================================
// SEND VALIDATION
// =============================================================================

export {
  // Types
  type SendValidationResult,
  type CampaignSendData,
  type VariableMappingResult,
  // Functions
  validateCampaignForSend,
  hasAllRequiredVariables,
  validateTemplateVariablesArray,
} from './send-validator'

// =============================================================================
// SCHEDULING
// =============================================================================

export {
  // Constants
  SCHEDULING_RULES,
  // Types
  type ScheduleValidationResult,
  // Functions
  isValidScheduleDate,
  getMinScheduleDate,
  getMaxScheduleDate,
  formatScheduleDate,
  parseScheduleDate,
  getSuggestedScheduleDate,
} from './scheduling'

// =============================================================================
// MERGING
// =============================================================================

export {
  // Types
  type CampaignMessagesResponse,
  // Functions
  isCampaignReset,
  mergeCampaignCountersMonotonic,
  mergeMessageStatsMonotonic,
} from './merging'

// =============================================================================
// MESSAGE FILTERING
// =============================================================================

export {
  // Types
  type MessageFilterStatus,
  type MessageFilterCriteria,
  type MessageStatusCounts,
  // Functions
  filterMessages,
  getMessageStatusCounts,
  calculateRealStats,
} from './message-filtering'
