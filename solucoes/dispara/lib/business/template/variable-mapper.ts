/**
 * Template Variable Mapper
 *
 * Pure functions for auto-mapping template variables to contact fields
 * and resolving variable values at runtime.
 */

import type { Contact, CustomFieldDefinition } from '@/types/contact.types'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Mapping between a template variable and a contact field.
 */
export interface VariableMapping {
  /** The variable name from the template */
  variable: string
  /** The field to map to (system field key or custom field key) */
  field: string
  /** Whether this is a system field (name, phone, email) */
  isSystem: boolean
}

/**
 * Result of resolving a variable value.
 */
export interface ResolvedVariable {
  /** The variable name */
  variable: string
  /** The resolved value (empty string if not found) */
  value: string
  /** Whether the value was successfully resolved */
  resolved: boolean
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Mapping of common variable names to system contact fields.
 * Supports both Portuguese and English naming conventions.
 */
export const SYSTEM_FIELDS = {
  // Portuguese names
  nome: 'name',
  telefone: 'phone',
  email: 'email',
  // English names
  name: 'name',
  phone: 'phone',
  // Common variations
  fone: 'phone',
  cel: 'phone',
  celular: 'phone',
  whatsapp: 'phone',
} as const

/**
 * Type for system field keys.
 */
export type SystemFieldKey = keyof typeof SYSTEM_FIELDS

/**
 * Type for system field values.
 */
export type SystemFieldValue = (typeof SYSTEM_FIELDS)[SystemFieldKey]

/**
 * List of recognized system field names for validation.
 */
export const SYSTEM_FIELD_NAMES = Object.keys(SYSTEM_FIELDS) as SystemFieldKey[]

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Checks if a variable name corresponds to a system field.
 *
 * @param variable - The variable name to check
 * @returns True if the variable maps to a system field
 *
 * @example
 * isSystemField("nome") // true
 * isSystemField("name") // true
 * isSystemField("produto") // false
 */
export function isSystemField(variable: string): boolean {
  const normalized = variable.toLowerCase()
  return normalized in SYSTEM_FIELDS
}

/**
 * Gets the system field key for a variable name.
 *
 * @param variable - The variable name
 * @returns The system field key or null if not a system field
 *
 * @example
 * getSystemFieldKey("nome") // "name"
 * getSystemFieldKey("telefone") // "phone"
 * getSystemFieldKey("produto") // null
 */
export function getSystemFieldKey(variable: string): SystemFieldValue | null {
  const normalized = variable.toLowerCase() as SystemFieldKey
  return SYSTEM_FIELDS[normalized] ?? null
}

/**
 * Attempts to auto-map template variables to contact fields.
 *
 * Strategy:
 * 1. First, check if variable name matches a system field
 * 2. Then, check if it matches a custom field key (exact match)
 * 3. Finally, check if it matches a custom field label (case-insensitive)
 *
 * @param variables - Array of variable names from the template
 * @param customFields - Array of custom field definitions
 * @returns Array of variable mappings (one per input variable)
 *
 * @example
 * const variables = ["nome", "produto", "codigo"]
 * const customFields = [
 *   { key: "produto", label: "Produto" },
 *   { key: "code", label: "Código" }
 * ]
 * autoMapVariables(variables, customFields)
 * // Returns: [
 * //   { variable: "nome", field: "name", isSystem: true },
 * //   { variable: "produto", field: "produto", isSystem: false },
 * //   { variable: "codigo", field: "", isSystem: false }
 * // ]
 */
export function autoMapVariables(
  variables: string[],
  customFields: CustomFieldDefinition[] = []
): VariableMapping[] {
  return variables.map((variable) => {
    const lowerVar = variable.toLowerCase()

    // Check system fields first
    if (isSystemField(variable)) {
      const systemKey = getSystemFieldKey(variable)
      return {
        variable,
        field: systemKey ?? '',
        isSystem: true,
      }
    }

    // Check custom fields by key (exact match)
    const byKey = customFields.find((cf) => cf.key === variable)
    if (byKey) {
      return {
        variable,
        field: byKey.key,
        isSystem: false,
      }
    }

    // Check custom fields by label (case-insensitive)
    const byLabel = customFields.find((cf) => cf.label.toLowerCase() === lowerVar)
    if (byLabel) {
      return {
        variable,
        field: byLabel.key,
        isSystem: false,
      }
    }

    // No match found
    return {
      variable,
      field: '',
      isSystem: false,
    }
  })
}

/**
 * Generates auto-fill values for template variables.
 * Returns placeholder syntax (e.g., "{{nome}}") for system fields,
 * empty string for unmatched variables.
 *
 * @param variables - Array of variable names
 * @returns Array of values to use as defaults (same order as input)
 *
 * @example
 * generateAutoFillValues(["nome", "telefone", "produto"])
 * // Returns: ["{{nome}}", "{{telefone}}", ""]
 */
export function generateAutoFillValues(variables: string[]): string[] {
  const systemFieldSet = new Set(['nome', 'telefone', 'email'])

  return variables.map((v) => {
    const lowerKey = v.toLowerCase()
    return systemFieldSet.has(lowerKey) ? `{{${lowerKey}}}` : ''
  })
}

/**
 * Resolves the value of a single variable for a contact.
 *
 * @param variable - The variable name to resolve
 * @param contact - The contact to get values from
 * @param customFieldValues - Optional custom field values (overrides contact.custom_fields)
 * @returns The resolved value or empty string if not found
 *
 * @example
 * const contact = { name: "João", phone: "5511999999999", custom_fields: { produto: "Tênis" } }
 * resolveVariableValue("nome", contact) // "João"
 * resolveVariableValue("produto", contact) // "Tênis"
 * resolveVariableValue("desconhecido", contact) // ""
 */
export function resolveVariableValue(
  variable: string,
  contact: Contact,
  customFieldValues?: Record<string, string>
): string {
  // Check system fields first
  const systemKey = getSystemFieldKey(variable)
  if (systemKey) {
    switch (systemKey) {
      case 'name':
        return contact.name ?? ''
      case 'phone':
        return contact.phone ?? ''
      case 'email':
        return contact.email ?? ''
      default:
        return ''
    }
  }

  // Check provided custom field values
  if (customFieldValues && variable in customFieldValues) {
    return customFieldValues[variable]
  }

  // Check contact's custom fields
  if (contact.custom_fields && variable in contact.custom_fields) {
    const value = contact.custom_fields[variable]
    return value != null ? String(value) : ''
  }

  return ''
}

/**
 * Resolves all variables for a contact.
 *
 * @param variables - Array of variable names to resolve
 * @param contact - The contact to get values from
 * @param customFieldValues - Optional custom field values
 * @returns Array of resolved variables with their values
 *
 * @example
 * const contact = { name: "João", phone: "5511999999999" }
 * resolveAllVariables(["nome", "telefone", "produto"], contact)
 * // Returns: [
 * //   { variable: "nome", value: "João", resolved: true },
 * //   { variable: "telefone", value: "5511999999999", resolved: true },
 * //   { variable: "produto", value: "", resolved: false }
 * // ]
 */
export function resolveAllVariables(
  variables: string[],
  contact: Contact,
  customFieldValues?: Record<string, string>
): ResolvedVariable[] {
  return variables.map((variable) => {
    const value = resolveVariableValue(variable, contact, customFieldValues)
    return {
      variable,
      value,
      resolved: value !== '',
    }
  })
}

/**
 * Checks if all required variables can be resolved for a contact.
 *
 * @param variables - Array of variable names to check
 * @param contact - The contact to validate against
 * @param customFieldValues - Optional custom field values
 * @returns True if all variables can be resolved to non-empty values
 *
 * @example
 * const contact = { name: "João", phone: "5511999999999" }
 * canResolveAllVariables(["nome", "telefone"], contact) // true
 * canResolveAllVariables(["nome", "produto"], contact) // false
 */
export function canResolveAllVariables(
  variables: string[],
  contact: Contact,
  customFieldValues?: Record<string, string>
): boolean {
  return variables.every((v) => resolveVariableValue(v, contact, customFieldValues) !== '')
}

/**
 * Gets the list of variables that cannot be resolved for a contact.
 *
 * @param variables - Array of variable names to check
 * @param contact - The contact to validate against
 * @param customFieldValues - Optional custom field values
 * @returns Array of variable names that could not be resolved
 *
 * @example
 * const contact = { name: "João" }
 * getUnresolvedVariables(["nome", "produto", "codigo"], contact)
 * // Returns: ["produto", "codigo"]
 */
export function getUnresolvedVariables(
  variables: string[],
  contact: Contact,
  customFieldValues?: Record<string, string>
): string[] {
  return variables.filter((v) => resolveVariableValue(v, contact, customFieldValues) === '')
}
