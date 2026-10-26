/**
 * Campaign Send Validator
 *
 * Validation logic for campaign dispatch.
 * Extracted from useCampaignWizard handleSend function (lines ~988-1051).
 *
 * @module lib/business/campaign/send-validator
 */

import { CampaignValidationError, validateCampaignName, validateRecipientCount } from './rules'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of campaign send validation.
 */
export interface SendValidationResult {
  /** Whether the campaign is valid to send */
  valid: boolean
  /** List of validation errors that block sending */
  errors: CampaignValidationError[]
  /** List of warnings that don't block but should be shown */
  warnings: string[]
}

/**
 * Data required to validate a campaign for sending.
 */
export interface CampaignSendData {
  /** Campaign name */
  name: string
  /** Selected template ID (must be non-empty) */
  templateId: string
  /** Number of recipients selected */
  recipientCount: number
  /** Account daily limit for unique users */
  accountLimit: number
  /** Current variable mappings from the wizard */
  variableMappings: Record<string, string>
  /** List of required variable keys from the template */
  requiredVariables: string[]
}

/**
 * Result of variable mapping validation.
 */
export interface VariableMappingResult {
  /** Whether all required variables are mapped */
  valid: boolean
  /** List of variable keys that are missing */
  missing: string[]
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates a campaign for sending.
 *
 * Checks:
 * 1. Campaign name is valid
 * 2. Template is selected
 * 3. At least one recipient is selected
 * 4. All required template variables are filled
 * 5. Recipient count doesn't exceed account limit (warning only)
 *
 * @param data - Campaign data to validate
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```ts
 * const result = validateCampaignForSend({
 *   name: 'Campanha Janeiro',
 *   templateId: 'tpl_123',
 *   recipientCount: 100,
 *   accountLimit: 250,
 *   variableMappings: { '1': '{{nome}}', '2': '' },
 *   requiredVariables: ['1', '2'],
 * })
 *
 * // result.valid === false
 * // result.errors includes variable error
 * ```
 */
export function validateCampaignForSend(data: CampaignSendData): SendValidationResult {
  const errors: CampaignValidationError[] = []
  const warnings: string[] = []

  // Validate campaign name
  const nameError = validateCampaignName(data.name)
  if (nameError) {
    errors.push(nameError)
  }

  // Validate template selection
  if (!data.templateId || data.templateId.trim().length === 0) {
    errors.push({
      field: 'templateId',
      message: 'Selecione um template para a campanha',
      code: 'TEMPLATE_REQUIRED',
    })
  }

  // Validate recipient count
  const recipientError = validateRecipientCount(data.recipientCount)
  if (recipientError) {
    errors.push(recipientError)
  }

  // Validate template variables
  const variableResult = hasAllRequiredVariables(
    data.variableMappings,
    data.requiredVariables
  )
  if (!variableResult.valid) {
    errors.push({
      field: 'templateVariables',
      message: `Preencha todas as variaveis do template (${variableResult.missing.length} pendentes)`,
      code: 'VARIABLES_INCOMPLETE',
    })
  }

  // Check account limit (warning, not blocking)
  if (data.recipientCount > data.accountLimit) {
    warnings.push(
      `Quantidade de destinatarios (${data.recipientCount}) excede o limite da conta (${data.accountLimit})`
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Checks if all required template variables have mappings.
 *
 * A variable is considered filled if:
 * - It exists in the mappings object
 * - Its value is a non-empty string after trimming
 *
 * @param mappings - Current variable mappings (key -> value)
 * @param required - List of required variable keys
 * @returns Object with validity and list of missing variables
 *
 * @example
 * ```ts
 * const result = hasAllRequiredVariables(
 *   { '1': '{{nome}}', '2': '', '3': '{{telefone}}' },
 *   ['1', '2', '3']
 * )
 * // { valid: false, missing: ['2'] }
 * ```
 */
export function hasAllRequiredVariables(
  mappings: Record<string, string>,
  required: string[]
): VariableMappingResult {
  const missing: string[] = []

  for (const key of required) {
    const value = mappings[key]
    const isFilled = typeof value === 'string' && value.trim().length > 0

    if (!isFilled) {
      missing.push(key)
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  }
}

/**
 * Validates template variables in the Meta API format (arrays).
 *
 * This handles the structure used by useCampaignWizard:
 * { header: string[], body: string[], buttons?: Record<string, string> }
 *
 * @param variables - Template variables object
 * @param expectedCounts - Expected count for each section
 * @returns Object with validity and count of missing variables
 *
 * @example
 * ```ts
 * const result = validateTemplateVariablesArray(
 *   { header: ['{{nome}}'], body: ['', '{{telefone}}'] },
 *   { header: 1, body: 2, buttons: 0 }
 * )
 * // { valid: false, missingCount: 1 }
 * ```
 */
export function validateTemplateVariablesArray(
  variables: { header: string[]; body: string[]; buttons?: Record<string, string> },
  expectedCounts: { header: number; body: number; buttons: number }
): { valid: boolean; missingCount: number } {
  const isFilled = (v: unknown): boolean => {
    return typeof v === 'string' && v.trim().length > 0
  }

  let totalRequired = expectedCounts.header + expectedCounts.body + expectedCounts.buttons
  let filledCount = 0

  // Count filled header variables
  for (const v of variables.header) {
    if (isFilled(v)) filledCount++
  }

  // Count filled body variables
  for (const v of variables.body) {
    if (isFilled(v)) filledCount++
  }

  // Count filled button variables
  if (variables.buttons) {
    for (const v of Object.values(variables.buttons)) {
      if (isFilled(v)) filledCount++
    }
  }

  const missingCount = Math.max(0, totalRequired - filledCount)

  return {
    valid: missingCount === 0,
    missingCount,
  }
}
