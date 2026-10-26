/**
 * Contact Business Logic Module
 *
 * Centralizes all contact-related business logic including:
 * - Contact transformation for sending
 * - System field definitions
 * - Contact status rules
 *
 * @example
 * ```ts
 * import {
 *   transformContactForSending,
 *   isSystemField,
 *   canReceiveMessages,
 *   ContactStatus,
 * } from '@/lib/business/contact'
 * ```
 */

// Transformer functions
export {
  transformContactForSending,
  transformContactsForSending,
  transformTestContact,
  createEmptyTransformOptions,
  buildVariableMappingsFromArrays,
  type ContactForSending,
  type TransformOptions,
} from './transformer'

// System fields
export {
  SYSTEM_FIELDS,
  isSystemField,
  getSystemFieldValue,
  getAllSystemFieldNames,
  getUniqueSystemFieldKeys,
  type SystemFieldName,
  type SystemFieldDefinition,
} from './system-fields'

// Status rules
export {
  ContactStatus,
  STATUS_RULES,
  canReceiveMessages,
  getStatusLabel,
  getStatusColor,
  isBlockedStatus,
} from './status'

// Bulk operations
export {
  normalizeEmailForUpdate,
  sanitizeCustomFieldsForUpdate,
  toggleContactSelection,
  toggleSelectAllContacts,
  selectAllContactsGlobal,
  clearContactSelection,
} from './bulk-operations'

// Filtering
export {
  matchesContactFilter,
  filterContacts,
  type ContactFilterCriteria,
} from './filtering'
