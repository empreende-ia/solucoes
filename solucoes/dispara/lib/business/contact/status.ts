/**
 * Contact Status Module
 *
 * Defines contact status types and business rules for determining
 * which contacts can receive messages based on their consent status.
 */

/**
 * Enumeration of all possible contact statuses.
 * These align with the database values used in the system.
 */
export enum ContactStatus {
  /** Contact has explicitly opted in to receive messages */
  ACTIVE = 'ACTIVE',
  /** Contact has opted out and must not receive messages */
  OPT_OUT = 'OPT_OUT',
  /** Contact phone number is invalid */
  INVALID = 'INVALID',
  /** Contact is blocked from receiving messages */
  BLOCKED = 'BLOCKED',
}

/**
 * Business rules for contact status handling.
 */
export const STATUS_RULES = {
  /** Statuses that are eligible to receive messages */
  CAN_RECEIVE: [ContactStatus.ACTIVE] as const,
  /** Statuses that block message delivery */
  BLOCKED_STATUSES: [
    ContactStatus.OPT_OUT,
    ContactStatus.INVALID,
    ContactStatus.BLOCKED,
  ] as const,
} as const

/**
 * Human-readable labels for each status in Portuguese.
 */
const STATUS_LABELS: Record<ContactStatus, string> = {
  [ContactStatus.ACTIVE]: 'Ativo',
  [ContactStatus.OPT_OUT]: 'Opt-out',
  [ContactStatus.INVALID]: 'Invalido',
  [ContactStatus.BLOCKED]: 'Bloqueado',
}

/**
 * Color codes for each status (Tailwind-compatible).
 */
const STATUS_COLORS: Record<ContactStatus, string> = {
  [ContactStatus.ACTIVE]: 'green',
  [ContactStatus.OPT_OUT]: 'yellow',
  [ContactStatus.INVALID]: 'red',
  [ContactStatus.BLOCKED]: 'gray',
}

/**
 * Determines if a contact with the given status can receive messages.
 *
 * @param status - The contact's current status
 * @returns True if the contact can receive messages
 *
 * @example
 * ```ts
 * canReceiveMessages(ContactStatus.ACTIVE)   // true
 * canReceiveMessages(ContactStatus.OPT_OUT)  // false
 * canReceiveMessages(ContactStatus.BLOCKED)  // false
 * ```
 */
export function canReceiveMessages(status: ContactStatus): boolean {
  return (STATUS_RULES.CAN_RECEIVE as readonly ContactStatus[]).includes(status)
}

/**
 * Returns the human-readable label for a contact status.
 *
 * @param status - The contact status
 * @returns Localized label string
 *
 * @example
 * ```ts
 * getStatusLabel(ContactStatus.ACTIVE)  // 'Ativo'
 * getStatusLabel(ContactStatus.OPT_OUT) // 'Opt-out'
 * ```
 */
export function getStatusLabel(status: ContactStatus): string {
  return STATUS_LABELS[status] ?? status
}

/**
 * Returns the color associated with a contact status.
 * Useful for UI styling and badges.
 *
 * @param status - The contact status
 * @returns Color name string (Tailwind-compatible)
 *
 * @example
 * ```ts
 * getStatusColor(ContactStatus.ACTIVE)   // 'green'
 * getStatusColor(ContactStatus.INVALID)  // 'red'
 * ```
 */
export function getStatusColor(status: ContactStatus): string {
  return STATUS_COLORS[status] ?? 'gray'
}

/**
 * Checks if a status is in the blocked list.
 *
 * @param status - The contact status to check
 * @returns True if the status blocks message delivery
 *
 * @example
 * ```ts
 * isBlockedStatus(ContactStatus.OPT_OUT)  // true
 * isBlockedStatus(ContactStatus.ACTIVE)   // false
 * ```
 */
export function isBlockedStatus(status: ContactStatus): boolean {
  return (STATUS_RULES.BLOCKED_STATUSES as readonly ContactStatus[]).includes(status)
}
