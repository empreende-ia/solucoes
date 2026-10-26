/**
 * Campaign Message Filtering Logic
 *
 * Pure functions for filtering and counting campaign messages.
 * Used by campaign details UI for search and status filtering.
 *
 * @module lib/business/campaign/message-filtering
 */

import type { Message } from '@/types'
import { MessageStatus } from '@/types'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Valid filter status values for message filtering.
 * 'all' returns all messages regardless of status.
 */
export type MessageFilterStatus = 'all' | 'sent' | 'failed' | 'pending' | 'skipped' | 'delivered' | 'read'

/**
 * Criteria for filtering messages.
 */
export interface MessageFilterCriteria {
  /** Filter by message status (optional, defaults to 'all') */
  status?: MessageFilterStatus
  /** Search term to match against contact name or phone (optional) */
  searchTerm?: string
}

/**
 * Counts of messages by status.
 */
export interface MessageStatusCounts {
  all: number
  sent: number
  failed: number
  pending: number
  skipped: number
  delivered: number
  read: number
}

// =============================================================================
// FILTERING
// =============================================================================

/**
 * Map MessageFilterStatus to MessageStatus enum values.
 * Returns undefined for 'all' since it matches everything.
 */
function filterStatusToMessageStatus(status: MessageFilterStatus): MessageStatus | undefined {
  switch (status) {
    case 'sent':
      return MessageStatus.SENT
    case 'failed':
      return MessageStatus.FAILED
    case 'pending':
      return MessageStatus.PENDING
    case 'skipped':
      return MessageStatus.SKIPPED
    case 'delivered':
      return MessageStatus.DELIVERED
    case 'read':
      return MessageStatus.READ
    case 'all':
    default:
      return undefined
  }
}

/**
 * Check if a message matches the search term.
 * Matches against contact name or phone number (case-insensitive).
 *
 * @param message - The message to check
 * @param searchTerm - The search term to match
 * @returns True if the message matches the search term
 */
function matchesSearchTerm(message: Message, searchTerm: string): boolean {
  if (!searchTerm) return true

  const normalizedSearch = searchTerm.toLowerCase()
  return (
    message.contactName.toLowerCase().includes(normalizedSearch) ||
    message.contactPhone.includes(searchTerm)
  )
}

/**
 * Check if a message matches the status filter.
 *
 * @param message - The message to check
 * @param status - The status to filter by
 * @returns True if the message matches the status filter
 */
function matchesStatus(message: Message, status?: MessageFilterStatus): boolean {
  if (!status || status === 'all') return true

  const targetStatus = filterStatusToMessageStatus(status)
  return message.status === targetStatus
}

/**
 * Filter messages by status and/or search term.
 *
 * @param messages - Array of messages to filter
 * @param criteria - Filter criteria (status and/or search term)
 * @returns Filtered array of messages
 *
 * @example
 * ```ts
 * const messages = [...]
 * const filtered = filterMessages(messages, { status: 'failed', searchTerm: 'João' })
 * ```
 */
export function filterMessages(
  messages: Message[],
  criteria: MessageFilterCriteria
): Message[] {
  if (!messages || messages.length === 0) return []

  const { status, searchTerm } = criteria

  // Fast path: no filters
  if ((!status || status === 'all') && !searchTerm) {
    return messages
  }

  return messages.filter(message => {
    if (!matchesStatus(message, status)) return false
    if (!matchesSearchTerm(message, searchTerm || '')) return false
    return true
  })
}

// =============================================================================
// COUNTING
// =============================================================================

/**
 * Get counts of messages by status.
 *
 * @param messages - Array of messages to count
 * @returns Object with counts for each status
 *
 * @example
 * ```ts
 * const messages = [...]
 * const counts = getMessageStatusCounts(messages)
 * console.log(`Sent: ${counts.sent}, Failed: ${counts.failed}`)
 * ```
 */
export function getMessageStatusCounts(messages: Message[]): MessageStatusCounts {
  const counts: MessageStatusCounts = {
    all: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    delivered: 0,
    read: 0,
  }

  if (!messages || messages.length === 0) return counts

  counts.all = messages.length

  for (const message of messages) {
    switch (message.status) {
      case MessageStatus.SENT:
        counts.sent++
        break
      case MessageStatus.FAILED:
        counts.failed++
        break
      case MessageStatus.PENDING:
        counts.pending++
        break
      case MessageStatus.SKIPPED:
        counts.skipped++
        break
      case MessageStatus.DELIVERED:
        counts.delivered++
        break
      case MessageStatus.READ:
        counts.read++
        break
    }
  }

  return counts
}

/**
 * Calculate real stats from loaded messages.
 * Used as fallback when campaign stats are not available.
 *
 * Note: "sent" includes SENT, DELIVERED, and READ statuses as these
 * represent messages that were successfully sent.
 *
 * @param messages - Array of messages to calculate stats from
 * @returns Stats object or null if no messages
 *
 * @example
 * ```ts
 * const messages = [...]
 * const stats = calculateRealStats(messages)
 * if (stats) {
 *   console.log(`Sent: ${stats.sent}, Delivered: ${stats.delivered}`)
 * }
 * ```
 */
export function calculateRealStats(messages: Message[]): {
  sent: number
  failed: number
  skipped: number
  delivered: number
  read: number
  total: number
} | null {
  if (!messages || messages.length === 0) return null

  const sent = messages.filter(
    m => m.status === MessageStatus.SENT ||
         m.status === MessageStatus.DELIVERED ||
         m.status === MessageStatus.READ
  ).length

  const failed = messages.filter(m => m.status === MessageStatus.FAILED).length
  const skipped = messages.filter(m => m.status === MessageStatus.SKIPPED).length
  const delivered = messages.filter(
    m => m.status === MessageStatus.DELIVERED || m.status === MessageStatus.READ
  ).length
  const read = messages.filter(m => m.status === MessageStatus.READ).length

  return {
    sent,
    failed,
    skipped,
    delivered,
    read,
    total: messages.length,
  }
}
