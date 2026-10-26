/**
 * Contact Transformer Module
 *
 * Provides pure functions to transform contacts into the format
 * required for campaign sending, including variable resolution.
 */

import type { Contact, TestContact } from '@/types'
import { SYSTEM_FIELDS, isSystemField, type SystemFieldName } from './system-fields'

/**
 * Represents a contact formatted for sending in a campaign.
 */
export interface ContactForSending {
  /** Unique identifier (same as contactId for regular contacts) */
  id: string
  /** Reference to the original contact record */
  contactId: string
  /** Phone number in E.164 format */
  phone: string
  /** Display name of the contact */
  name: string
  /** Resolved template variables for this contact */
  variables: Record<string, string>
}

/**
 * Options for transforming contacts.
 */
export interface TransformOptions {
  /**
   * Maps template variable names to field references.
   * Value format: "{{fieldName}}" for system fields or custom field keys.
   * Example: { "1": "{{nome}}", "2": "{{cidade}}" }
   */
  variableMappings: Record<string, string>
  /**
   * Custom field values indexed by contactId then fieldName.
   * Example: { "contact-123": { "cidade": "Sao Paulo" } }
   */
  customFields: Record<string, Record<string, string>>
}

/**
 * Regex to extract field name from template variable syntax.
 * Matches: {{fieldName}} and extracts "fieldName"
 */
const VARIABLE_PATTERN = /^\{\{(\w+)\}\}$/

/**
 * Resolves a single variable value for a contact.
 *
 * @param variableValue - The variable reference (e.g., "{{nome}}" or literal value)
 * @param contact - The contact to resolve values from
 * @param customFieldsForContact - Custom field values for this contact
 * @returns The resolved string value
 */
function resolveVariableValue(
  variableValue: string,
  contact: Contact,
  customFieldsForContact: Record<string, string>
): string {
  // Check if it's a template variable reference
  const match = variableValue.match(VARIABLE_PATTERN)

  if (!match) {
    // Not a variable reference, return as literal value
    return variableValue
  }

  const fieldName = match[1].toLowerCase()

  // Try system field first
  if (isSystemField(fieldName)) {
    const field = SYSTEM_FIELDS[fieldName as SystemFieldName]
    return field.accessor(contact)
  }

  // Try custom field from provided map
  if (customFieldsForContact[fieldName] !== undefined) {
    return customFieldsForContact[fieldName]
  }

  // Try custom field from contact record
  const contactCustomFields = contact.custom_fields
  if (contactCustomFields && typeof contactCustomFields === 'object') {
    const value = contactCustomFields[fieldName]
    if (value !== undefined && value !== null) {
      return String(value)
    }
  }

  // Variable not found, return empty string
  return ''
}

/**
 * Resolves all variable mappings for a contact.
 *
 * @param variableMappings - Map of variable keys to field references
 * @param contact - The contact to resolve values from
 * @param customFieldsForContact - Custom field values for this contact
 * @returns Record of resolved variable values
 */
function resolveVariables(
  variableMappings: Record<string, string>,
  contact: Contact,
  customFieldsForContact: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(variableMappings)) {
    resolved[key] = resolveVariableValue(value, contact, customFieldsForContact)
  }

  return resolved
}

/**
 * Transforms a single contact into the format required for sending.
 *
 * @param contact - The contact to transform
 * @param options - Transformation options including variable mappings
 * @returns The contact formatted for sending
 *
 * @example
 * ```ts
 * const contact = { id: '1', name: 'John', phone: '+5511999999999', ... }
 * const options = {
 *   variableMappings: { "1": "{{nome}}", "2": "{{cidade}}" },
 *   customFields: { "1": { "cidade": "Sao Paulo" } }
 * }
 * const result = transformContactForSending(contact, options)
 * // { id: '1', contactId: '1', phone: '+5511999999999', name: 'John', variables: { "1": "John", "2": "Sao Paulo" } }
 * ```
 */
export function transformContactForSending(
  contact: Contact,
  options: TransformOptions
): ContactForSending {
  const customFieldsForContact = options.customFields[contact.id] ?? {}

  return {
    id: contact.id,
    contactId: contact.id,
    phone: contact.phone,
    name: contact.name || contact.phone,
    variables: resolveVariables(
      options.variableMappings,
      contact,
      customFieldsForContact
    ),
  }
}

/**
 * Transforms multiple contacts into the format required for sending.
 *
 * @param contacts - Array of contacts to transform
 * @param options - Transformation options including variable mappings
 * @returns Array of contacts formatted for sending
 *
 * @example
 * ```ts
 * const contacts = [contact1, contact2]
 * const result = transformContactsForSending(contacts, options)
 * // [{ id: '1', ... }, { id: '2', ... }]
 * ```
 */
export function transformContactsForSending(
  contacts: Contact[],
  options: TransformOptions
): ContactForSending[] {
  return contacts.map((contact) => transformContactForSending(contact, options))
}

/**
 * Transforms a test contact into the format required for sending.
 * Test contacts have a simpler structure without custom fields from DB.
 *
 * @param testContact - The test contact with name and phone
 * @param contactId - The resolved contact ID for the test contact
 * @param variableMappings - Map of variable keys to field references
 * @returns The test contact formatted for sending
 *
 * @example
 * ```ts
 * const testContact = { name: 'Test User', phone: '+5511999999999' }
 * const result = transformTestContact(testContact, 'test-id-123', { "1": "{{nome}}" })
 * // { id: 'test-id-123', contactId: 'test-id-123', phone: '+5511999999999', name: 'Test User', variables: { "1": "Test User" } }
 * ```
 */
export function transformTestContact(
  testContact: TestContact,
  contactId: string,
  variableMappings: Record<string, string>
): ContactForSending {
  // Create a minimal contact-like object for variable resolution
  const pseudoContact: Contact = {
    id: contactId,
    phone: testContact.phone,
    name: testContact.name || testContact.phone,
    status: 'Opt-in' as any, // Not used in transformation
    tags: [],
    lastActive: new Date().toISOString(),
    custom_fields: (testContact as any).custom_fields || {},
  }

  return transformContactForSending(pseudoContact, {
    variableMappings,
    customFields: {},
  })
}

/**
 * Creates empty transform options for cases with no variable mappings.
 *
 * @returns Empty TransformOptions object
 */
export function createEmptyTransformOptions(): TransformOptions {
  return {
    variableMappings: {},
    customFields: {},
  }
}

/**
 * Builds variable mappings from template variable arrays.
 * Converts the Meta API format (arrays) to a key-value mapping.
 *
 * @param header - Array of header variable values
 * @param body - Array of body variable values
 * @returns Variable mappings record
 *
 * @example
 * ```ts
 * const mappings = buildVariableMappingsFromArrays(
 *   ['{{nome}}'],           // header
 *   ['{{nome}}', '{{cidade}}']  // body
 * )
 * // { "header_1": "{{nome}}", "body_1": "{{nome}}", "body_2": "{{cidade}}" }
 * ```
 */
export function buildVariableMappingsFromArrays(
  header: string[],
  body: string[]
): Record<string, string> {
  const mappings: Record<string, string> = {}

  header.forEach((value, index) => {
    if (value) {
      mappings[`header_${index + 1}`] = value
    }
  })

  body.forEach((value, index) => {
    if (value) {
      mappings[`body_${index + 1}`] = value
    }
  })

  return mappings
}
