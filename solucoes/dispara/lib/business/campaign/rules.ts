/**
 * Campaign Business Rules
 *
 * Centralized business rules for campaign management.
 * These rules define the core constraints and validations
 * that govern campaign creation and contact eligibility.
 *
 * @module lib/business/campaign/rules
 */

import { Contact, ContactStatus } from '@/types'

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Core campaign business rules.
 * These are enforced both in the UI (wizard) and backend (precheck/dispatch).
 */
export const CAMPAIGN_RULES = {
  /** Contacts with opt-out status never enter the audience */
  EXCLUDE_OPTED_OUT: true,
  /** Suppressed contacts do not receive messages */
  EXCLUDE_SUPPRESSED: true,
  /** Minimum number of recipients required for a campaign */
  MIN_RECIPIENTS: 1,
  /** Minimum length for campaign name */
  MIN_NAME_LENGTH: 3,
} as const

// =============================================================================
// TYPES
// =============================================================================

/**
 * Represents a validation error for campaign fields.
 */
export type CampaignValidationError = {
  /** The field that failed validation */
  field: string
  /** Human-readable error message (Portuguese) */
  message: string
  /** Machine-readable error code for programmatic handling */
  code: string
}

/**
 * Result of contact eligibility check.
 */
export type ContactEligibilityResult = {
  /** Whether the contact can receive the campaign */
  eligible: boolean
  /** Reason for ineligibility (only present if eligible is false) */
  reason?: string
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates a campaign name against business rules.
 *
 * @param name - The campaign name to validate
 * @returns Validation error if invalid, null if valid
 *
 * @example
 * ```ts
 * const error = validateCampaignName('AB')
 * // { field: 'name', message: 'Nome deve ter pelo menos 3 caracteres', code: 'NAME_TOO_SHORT' }
 *
 * const error2 = validateCampaignName('Campanha Janeiro')
 * // null
 * ```
 */
export function validateCampaignName(name: string): CampaignValidationError | null {
  const trimmed = (name ?? '').trim()

  if (trimmed.length === 0) {
    return {
      field: 'name',
      message: 'Nome da campanha e obrigatorio',
      code: 'NAME_REQUIRED',
    }
  }

  if (trimmed.length < CAMPAIGN_RULES.MIN_NAME_LENGTH) {
    return {
      field: 'name',
      message: `Nome deve ter pelo menos ${CAMPAIGN_RULES.MIN_NAME_LENGTH} caracteres`,
      code: 'NAME_TOO_SHORT',
    }
  }

  return null
}

/**
 * Determines if a contact is eligible to receive a campaign message.
 *
 * Business rules enforced:
 * - Contacts with OPT_OUT status are always excluded
 * - Contacts with suppressed phone numbers are excluded
 *
 * @param contact - The contact to evaluate
 * @param suppressedPhones - Set of normalized phone numbers that are suppressed
 * @returns Object indicating eligibility and reason if not eligible
 *
 * @example
 * ```ts
 * const suppressed = new Set(['5511999999999'])
 *
 * // Opt-out contact
 * const result1 = canContactReceiveCampaign(
 *   { status: ContactStatus.OPT_OUT, phone: '5511888888888' },
 *   suppressed
 * )
 * // { eligible: false, reason: 'Contato fez opt-out' }
 *
 * // Suppressed contact
 * const result2 = canContactReceiveCampaign(
 *   { status: ContactStatus.OPT_IN, phone: '5511999999999' },
 *   suppressed
 * )
 * // { eligible: false, reason: 'Telefone esta na lista de supressao' }
 *
 * // Eligible contact
 * const result3 = canContactReceiveCampaign(
 *   { status: ContactStatus.OPT_IN, phone: '5511777777777' },
 *   suppressed
 * )
 * // { eligible: true }
 * ```
 */
export function canContactReceiveCampaign(
  contact: Pick<Contact, 'status' | 'phone'>,
  suppressedPhones: Set<string>
): ContactEligibilityResult {
  // Rule: Opt-out contacts are always excluded
  if (CAMPAIGN_RULES.EXCLUDE_OPTED_OUT && contact.status === ContactStatus.OPT_OUT) {
    return {
      eligible: false,
      reason: 'Contato fez opt-out',
    }
  }

  // Rule: Suppressed phones are excluded
  if (CAMPAIGN_RULES.EXCLUDE_SUPPRESSED) {
    const normalizedPhone = normalizePhoneForComparison(contact.phone)
    if (normalizedPhone && suppressedPhones.has(normalizedPhone)) {
      return {
        eligible: false,
        reason: 'Telefone esta na lista de supressao',
      }
    }
  }

  return { eligible: true }
}

/**
 * Validates recipient count against minimum requirements.
 *
 * @param count - Number of recipients selected
 * @returns Validation error if invalid, null if valid
 *
 * @example
 * ```ts
 * const error = validateRecipientCount(0)
 * // { field: 'recipients', message: 'Selecione pelo menos 1 destinatario', code: 'NO_RECIPIENTS' }
 * ```
 */
export function validateRecipientCount(count: number): CampaignValidationError | null {
  if (count < CAMPAIGN_RULES.MIN_RECIPIENTS) {
    return {
      field: 'recipients',
      message: `Selecione pelo menos ${CAMPAIGN_RULES.MIN_RECIPIENTS} destinatario`,
      code: 'NO_RECIPIENTS',
    }
  }

  return null
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Normalizes a phone number for comparison purposes.
 * Removes all non-digit characters.
 *
 * @internal
 */
function normalizePhoneForComparison(phone: string | undefined | null): string {
  if (!phone) return ''
  return String(phone).replace(/\D/g, '').trim()
}
