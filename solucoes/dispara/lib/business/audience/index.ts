/**
 * Audience Business Logic Module
 *
 * This module provides pure functions for audience management in campaigns.
 * All functions are side-effect free and can be used in both React components
 * and server-side code.
 *
 * @module audience
 *
 * @example
 * ```typescript
 * import {
 *   filterContactsByCriteria,
 *   calculateAudienceStats,
 *   applyPreset,
 * } from '@/lib/business/audience'
 *
 * // Filter contacts by criteria
 * const eligible = filterContactsByCriteria(contacts, criteria, suppressedPhones)
 *
 * // Calculate statistics
 * const stats = calculateAudienceStats(contacts, suppressedPhones)
 *
 * // Apply a preset
 * const result = applyPreset('opt_in', contacts, suppressedPhones)
 * ```
 */

// =============================================================================
// CRITERIA VALIDATOR
// =============================================================================

export {
  // Types
  type CriteriaStatus,
  type CustomFieldMode,
  type AudienceCriteria,
  type EligibilityResult,
  // Functions
  isContactEligible,
  filterContactsByCriteria,
  getContactIdsByCriteria,
  createDefaultCriteria,
} from './criteria-validator'

// =============================================================================
// STATS CALCULATOR
// =============================================================================

export {
  // Types
  type UfCount,
  type TagCount,
  type DdiCount,
  type CustomFieldCount,
  type AudienceStats,
  // Functions
  findTopTag,
  calculateAudienceStats,
  calculateAudienceSummary,
} from './stats-calculator'

// =============================================================================
// PRESETS
// =============================================================================

export {
  // Types
  type AudiencePresetId,
  type PresetConfig,
  type PresetOptions,
  type PresetResult,
  // Constants
  AUDIENCE_PRESETS,
  // Functions
  getPresetConfig,
  getPresetCriteria,
  applyPreset,
  getPresetOptions,
  presetRequiresOptions,
} from './presets'
