/**
 * Audience Criteria Validator
 *
 * Pure functions for filtering contacts based on audience criteria.
 * Extracted from useCampaignWizard hook for reusability across the application.
 */

import { Contact, ContactStatus } from '@/types'
import { normalizePhoneNumber, getCountryCallingCodeFromPhone } from '@/lib/phone-formatter'
import { getBrazilUfFromPhone } from '@/lib/br-geo'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Criteria status options for filtering contacts.
 */
export type CriteriaStatus = 'OPT_IN' | 'OPT_OUT' | 'UNKNOWN' | 'ALL'

/**
 * Mode for custom field matching.
 */
export type CustomFieldMode = 'exists' | 'equals'

/**
 * Audience filtering criteria.
 * All fields are optional - only specified criteria are applied.
 */
export interface AudienceCriteria {
  /** Filter by contact status */
  status: CriteriaStatus
  /** Include only contacts with this specific tag */
  includeTag?: string | null
  /** Include only contacts created within N days */
  createdWithinDays?: number | null
  /** Exclude opted-out contacts (always true in practice) */
  excludeOptOut?: boolean
  /** Include only contacts with no tags */
  noTags?: boolean
  /** Filter by Brazilian UF (derived from phone DDD) */
  uf?: string | null
  /** Filter by country calling code (DDI) */
  ddi?: string | null
  /** Custom field key to filter by */
  customFieldKey?: string | null
  /** Custom field matching mode */
  customFieldMode?: CustomFieldMode | null
  /** Custom field value for 'equals' mode */
  customFieldValue?: string | null
}

/**
 * Result of contact eligibility check.
 */
export interface EligibilityResult {
  /** Whether the contact is eligible */
  eligible: boolean
  /** Reason for ineligibility (if not eligible) */
  reason?: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Maps criteria status string to ContactStatus enum value.
 *
 * @param status - Criteria status string
 * @returns Corresponding ContactStatus or null for 'ALL'
 */
function mapCriteriaStatusToContactStatus(status: CriteriaStatus): ContactStatus | null {
  if (status === 'OPT_IN') return ContactStatus.OPT_IN
  if (status === 'OPT_OUT') return ContactStatus.OPT_OUT
  if (status === 'UNKNOWN') return ContactStatus.UNKNOWN
  return null // ALL
}

/**
 * Safely extracts phone string from contact.
 *
 * @param contact - Contact object
 * @returns Phone string or empty string
 */
function getContactPhone(contact: Contact): string {
  return String(contact.phone || '').trim()
}

/**
 * Safely extracts createdAt timestamp from contact.
 *
 * @param contact - Contact object
 * @returns CreatedAt string or undefined
 */
function getContactCreatedAt(contact: Contact): string | undefined {
  const c = contact as unknown as Record<string, unknown>
  return (c.createdAt || c.created_at) as string | undefined
}

/**
 * Safely extracts custom fields from contact.
 *
 * @param contact - Contact object
 * @returns Custom fields object or undefined
 */
function getContactCustomFields(contact: Contact): Record<string, unknown> | undefined {
  const c = contact as unknown as Record<string, unknown>
  const cf = c.custom_fields
  return cf && typeof cf === 'object' ? (cf as Record<string, unknown>) : undefined
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Checks if a single contact is eligible based on the given criteria.
 *
 * Business rules applied:
 * - OPT_OUT contacts are never eligible (hard rule)
 * - Suppressed phones are never eligible (hard rule)
 * - Additional criteria are applied as filters
 *
 * @param contact - Contact to check
 * @param criteria - Audience criteria to apply
 * @param suppressedPhones - Set of suppressed phone numbers (normalized E.164)
 * @returns Eligibility result with reason if not eligible
 *
 * @example
 * ```typescript
 * const result = isContactEligible(contact, { status: 'OPT_IN' }, suppressedPhones)
 * if (!result.eligible) {
 *   console.log('Not eligible:', result.reason)
 * }
 * ```
 */
export function isContactEligible(
  contact: Contact,
  criteria: AudienceCriteria,
  suppressedPhones: Set<string>
): EligibilityResult {
  const now = Date.now()
  const withinMs = criteria.createdWithinDays
    ? criteria.createdWithinDays * 24 * 60 * 60 * 1000
    : null

  // Hard rule: OPT_OUT contacts never receive messages
  if (contact.status === ContactStatus.OPT_OUT) {
    return { eligible: false, reason: 'OPTED_OUT' }
  }

  // Hard rule: Suppressed phones never receive messages
  const normalizedPhone = normalizePhoneNumber(getContactPhone(contact))
  if (normalizedPhone && suppressedPhones.has(normalizedPhone)) {
    return { eligible: false, reason: 'SUPPRESSED' }
  }

  // UF filter (Brazil only)
  if (criteria.uf) {
    const targetUf = String(criteria.uf).trim().toUpperCase()
    if (targetUf) {
      const contactUf = getBrazilUfFromPhone(getContactPhone(contact))
      if (!contactUf || contactUf !== targetUf) {
        return { eligible: false, reason: 'UF_MISMATCH' }
      }
    }
  }

  // DDI filter (country)
  if (criteria.ddi) {
    const targetDdi = String(criteria.ddi).trim().replace(/^\+/, '')
    if (targetDdi) {
      const contactDdi = getCountryCallingCodeFromPhone(getContactPhone(contact))
      if (!contactDdi || String(contactDdi) !== targetDdi) {
        return { eligible: false, reason: 'DDI_MISMATCH' }
      }
    }
  }

  // Status filter
  if (criteria.status !== 'ALL') {
    const desiredStatus = mapCriteriaStatusToContactStatus(criteria.status)
    if (desiredStatus && contact.status !== desiredStatus) {
      return { eligible: false, reason: 'STATUS_MISMATCH' }
    }
  }

  // Tags filter
  const tags = contact.tags || []

  // No tags filter
  if (criteria.noTags) {
    if (tags.length !== 0) {
      return { eligible: false, reason: 'HAS_TAGS' }
    }
  }

  // Include tag filter
  if (criteria.includeTag) {
    const targetTag = String(criteria.includeTag).trim().toLowerCase()
    if (targetTag) {
      const hasTag = tags.some((t) => String(t || '').trim().toLowerCase() === targetTag)
      if (!hasTag) {
        return { eligible: false, reason: 'MISSING_TAG' }
      }
    }
  }

  // Custom field filter
  if (criteria.customFieldKey) {
    const key = String(criteria.customFieldKey).trim()
    if (key) {
      const customFields = getContactCustomFields(contact)
      const rawValue = customFields ? customFields[key] : undefined
      const isEmpty =
        rawValue === null ||
        rawValue === undefined ||
        (typeof rawValue === 'string' && rawValue.trim() === '')

      const mode = criteria.customFieldMode ?? 'exists'

      if (mode === 'exists') {
        if (isEmpty) {
          return { eligible: false, reason: 'CUSTOM_FIELD_MISSING' }
        }
      } else if (mode === 'equals') {
        if (isEmpty) {
          return { eligible: false, reason: 'CUSTOM_FIELD_MISSING' }
        }
        const expected = String(criteria.customFieldValue ?? '').trim().toLowerCase()
        if (!expected) {
          return { eligible: false, reason: 'CUSTOM_FIELD_VALUE_MISSING' }
        }
        const actual = String(rawValue).trim().toLowerCase()
        if (actual !== expected) {
          return { eligible: false, reason: 'CUSTOM_FIELD_MISMATCH' }
        }
      }
    }
  }

  // Created within filter
  if (withinMs) {
    const createdAt = getContactCreatedAt(contact)
    if (!createdAt) {
      return { eligible: false, reason: 'MISSING_CREATED_AT' }
    }
    const ts = new Date(String(createdAt)).getTime()
    if (!Number.isFinite(ts)) {
      return { eligible: false, reason: 'INVALID_CREATED_AT' }
    }
    if (now - ts > withinMs) {
      return { eligible: false, reason: 'TOO_OLD' }
    }
  }

  return { eligible: true }
}

/**
 * Filters a list of contacts based on the given criteria.
 *
 * This is the main entry point for audience filtering. It applies all
 * business rules and criteria to determine which contacts should receive
 * a campaign.
 *
 * @param contacts - List of contacts to filter
 * @param criteria - Audience criteria to apply
 * @param suppressedPhones - Set of suppressed phone numbers (normalized E.164)
 * @returns Array of eligible contacts
 *
 * @example
 * ```typescript
 * const eligibleContacts = filterContactsByCriteria(
 *   allContacts,
 *   { status: 'OPT_IN', includeTag: 'VIP' },
 *   suppressedPhones
 * )
 * console.log(`${eligibleContacts.length} contacts eligible`)
 * ```
 */
export function filterContactsByCriteria(
  contacts: Contact[],
  criteria: AudienceCriteria,
  suppressedPhones: Set<string>
): Contact[] {
  return contacts.filter((contact) => {
    const result = isContactEligible(contact, criteria, suppressedPhones)
    return result.eligible
  })
}

/**
 * Gets the IDs of contacts that match the given criteria.
 *
 * Convenience function that returns only the IDs, useful for
 * selection state management.
 *
 * @param contacts - List of contacts to filter
 * @param criteria - Audience criteria to apply
 * @param suppressedPhones - Set of suppressed phone numbers (normalized E.164)
 * @returns Array of eligible contact IDs
 *
 * @example
 * ```typescript
 * const selectedIds = getContactIdsByCriteria(
 *   allContacts,
 *   { status: 'OPT_IN', createdWithinDays: 7 },
 *   suppressedPhones
 * )
 * setSelectedContactIds(selectedIds)
 * ```
 */
export function getContactIdsByCriteria(
  contacts: Contact[],
  criteria: AudienceCriteria,
  suppressedPhones: Set<string>
): string[] {
  return filterContactsByCriteria(contacts, criteria, suppressedPhones).map((c) => c.id)
}

/**
 * Creates a default criteria object with safe defaults.
 *
 * @returns Default AudienceCriteria with OPT_IN status
 */
export function createDefaultCriteria(): AudienceCriteria {
  return {
    status: 'OPT_IN',
    includeTag: null,
    createdWithinDays: null,
    excludeOptOut: true,
    noTags: false,
    uf: null,
    ddi: null,
    customFieldKey: null,
    customFieldMode: null,
    customFieldValue: null,
  }
}
