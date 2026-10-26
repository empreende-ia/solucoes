/**
 * Contact Filtering
 *
 * Pure functions for filtering contacts based on various criteria.
 * Useful for client-side filtering when server-side filtering is not available.
 *
 * @module lib/business/contact/filtering
 */

import type { Contact } from '@/types'

/**
 * Criteria for filtering contacts.
 */
export interface ContactFilterCriteria {
  /** Search term to match against name, phone, or email */
  searchTerm?: string
  /** Contact status to filter by */
  status?: string
  /** Tags the contact must have (at least one) */
  tags?: string[]
}

/**
 * Checks if a contact matches the given filter criteria.
 *
 * Matching rules:
 * - searchTerm: Case-insensitive match against name, phone, or email
 * - status: Exact match (case-insensitive)
 * - tags: Contact must have at least one of the specified tags
 *
 * Empty criteria always matches.
 *
 * @param contact - Contact to check
 * @param criteria - Filter criteria to apply
 * @returns true if contact matches all criteria
 *
 * @example
 * ```ts
 * const contact = {
 *   id: '1',
 *   name: 'John Doe',
 *   phone: '+5511999999999',
 *   email: 'john@example.com',
 *   status: ContactStatus.OPT_IN,
 *   tags: ['vip', 'lead'],
 *   lastActive: '2024-01-01'
 * }
 *
 * matchesContactFilter(contact, { searchTerm: 'john' }) // true
 * matchesContactFilter(contact, { status: 'Opt-in' }) // true
 * matchesContactFilter(contact, { tags: ['vip'] }) // true
 * matchesContactFilter(contact, { searchTerm: 'jane' }) // false
 * ```
 */
export function matchesContactFilter(
  contact: Contact,
  criteria: ContactFilterCriteria
): boolean {
  const { searchTerm, status, tags } = criteria

  // Search term filter
  if (searchTerm && searchTerm.trim() !== '') {
    const term = searchTerm.toLowerCase().trim()
    const name = (contact.name ?? '').toLowerCase()
    const phone = contact.phone.toLowerCase()
    const email = (contact.email ?? '').toLowerCase()

    const matchesSearch =
      name.includes(term) || phone.includes(term) || email.includes(term)

    if (!matchesSearch) {
      return false
    }
  }

  // Status filter
  if (status && status !== 'ALL') {
    const contactStatus = contact.status.toLowerCase()
    const filterStatus = status.toLowerCase()

    if (contactStatus !== filterStatus) {
      return false
    }
  }

  // Tags filter
  if (tags && tags.length > 0) {
    const hasMatchingTag = tags.some((tag) => contact.tags.includes(tag))

    if (!hasMatchingTag) {
      return false
    }
  }

  return true
}

/**
 * Filters an array of contacts based on the given criteria.
 *
 * @param contacts - Array of contacts to filter
 * @param criteria - Filter criteria to apply
 * @returns Filtered array of contacts
 *
 * @example
 * ```ts
 * const contacts = [contact1, contact2, contact3]
 * filterContacts(contacts, { searchTerm: 'john', status: 'Opt-in' })
 * ```
 */
export function filterContacts(
  contacts: Contact[],
  criteria: ContactFilterCriteria
): Contact[] {
  return contacts.filter((contact) => matchesContactFilter(contact, criteria))
}
