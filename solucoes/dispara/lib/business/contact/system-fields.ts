/**
 * System Fields Module
 *
 * Centralizes the definition and access of system-level fields
 * that are available on all contacts (name, phone, email).
 * These fields are mapped from template variables to contact properties.
 */

import type { Contact } from '@/types'

/**
 * Definition of a system field with its accessor function.
 */
export interface SystemFieldDefinition {
  /** The internal key used to access the field value */
  key: 'name' | 'phone' | 'email'
  /** Human-readable label for the field */
  label: string
  /** Function to extract the field value from a contact */
  accessor: (contact: Contact) => string
}

/**
 * Map of all system fields available for template variable resolution.
 * Keys include both Portuguese and English versions for compatibility.
 */
export const SYSTEM_FIELDS = {
  nome: {
    key: 'name',
    label: 'Nome',
    accessor: (c: Contact) => c.name || '',
  },
  name: {
    key: 'name',
    label: 'Nome',
    accessor: (c: Contact) => c.name || '',
  },
  telefone: {
    key: 'phone',
    label: 'Telefone',
    accessor: (c: Contact) => c.phone,
  },
  phone: {
    key: 'phone',
    label: 'Telefone',
    accessor: (c: Contact) => c.phone,
  },
  email: {
    key: 'email',
    label: 'Email',
    accessor: (c: Contact) => c.email || '',
  },
} as const satisfies Record<string, SystemFieldDefinition>

/**
 * Type representing valid system field names (Portuguese and English).
 */
export type SystemFieldName = keyof typeof SYSTEM_FIELDS

/**
 * Checks if a field name corresponds to a system field.
 *
 * @param fieldName - The field name to check
 * @returns True if the field name is a system field
 *
 * @example
 * ```ts
 * isSystemField('nome')     // true
 * isSystemField('name')     // true
 * isSystemField('custom')   // false
 * ```
 */
export function isSystemField(fieldName: string): fieldName is SystemFieldName {
  return fieldName.toLowerCase() in SYSTEM_FIELDS
}

/**
 * Retrieves the value of a system field from a contact.
 *
 * @param fieldName - The system field name (case-insensitive)
 * @param contact - The contact to extract the value from
 * @returns The field value as a string
 *
 * @example
 * ```ts
 * const contact = { id: '1', name: 'John', phone: '+5511999999999', ... }
 * getSystemFieldValue('nome', contact)  // 'John'
 * getSystemFieldValue('phone', contact) // '+5511999999999'
 * ```
 */
export function getSystemFieldValue(fieldName: SystemFieldName, contact: Contact): string {
  const normalizedName = fieldName.toLowerCase() as SystemFieldName
  const field = SYSTEM_FIELDS[normalizedName]
  return field.accessor(contact)
}

/**
 * Returns all valid system field names (lowercase).
 *
 * @returns Array of system field names
 *
 * @example
 * ```ts
 * getAllSystemFieldNames() // ['nome', 'name', 'telefone', 'phone', 'email']
 * ```
 */
export function getAllSystemFieldNames(): SystemFieldName[] {
  return Object.keys(SYSTEM_FIELDS) as SystemFieldName[]
}

/**
 * Returns unique system field keys (deduplicated, only internal keys).
 *
 * @returns Array of unique system field keys
 *
 * @example
 * ```ts
 * getUniqueSystemFieldKeys() // ['name', 'phone', 'email']
 * ```
 */
export function getUniqueSystemFieldKeys(): Array<'name' | 'phone' | 'email'> {
  return ['name', 'phone', 'email']
}
