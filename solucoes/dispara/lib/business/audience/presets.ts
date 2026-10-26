/**
 * Audience Presets
 *
 * Pre-defined audience configurations for common use cases.
 * Extracted from useCampaignWizard hook for reusability across the application.
 */

import { Contact } from '@/types'
import {
  AudienceCriteria,
  getContactIdsByCriteria,
  createDefaultCriteria,
} from './criteria-validator'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Available audience preset identifiers.
 */
export type AudiencePresetId =
  | 'all'
  | 'opt_in'
  | 'new_7d'
  | 'tag_top'
  | 'no_tags'
  | 'manual'
  | 'test'

/**
 * Configuration for an audience preset.
 */
export interface PresetConfig {
  /** Human-readable label for the preset */
  label: string
  /** Description explaining what the preset does */
  description: string
  /** The criteria applied by this preset */
  criteria: AudienceCriteria
  /** Whether this preset requires additional options (e.g., topTag) */
  requiresOptions?: boolean
}

/**
 * Options that can be passed when applying a preset.
 */
export interface PresetOptions {
  /** The most common tag in the contact list (for tag_top preset) */
  topTag?: string | null
}

/**
 * Result of applying a preset.
 */
export interface PresetResult {
  /** The preset that was applied */
  preset: AudiencePresetId
  /** The criteria that was applied */
  criteria: AudienceCriteria
  /** The IDs of contacts that match the criteria */
  contactIds: string[]
  /** Fallback preset if original couldn't be applied */
  fallbackPreset?: AudiencePresetId
}

// =============================================================================
// PRESET DEFINITIONS
// =============================================================================

/**
 * Pre-defined audience presets.
 *
 * Each preset defines:
 * - label: Human-readable name
 * - description: Explanation for users
 * - criteria: The filter criteria to apply
 */
export const AUDIENCE_PRESETS: Record<Exclude<AudiencePresetId, 'test'>, PresetConfig> = {
  all: {
    label: 'Todos',
    description: 'Todos os contatos elegíveis (exclui opt-out e suprimidos)',
    criteria: {
      status: 'ALL',
      includeTag: null,
      createdWithinDays: null,
      excludeOptOut: true,
      noTags: false,
      uf: null,
      ddi: null,
      customFieldKey: null,
      customFieldMode: null,
      customFieldValue: null,
    },
  },
  opt_in: {
    label: 'Opt-in',
    description: 'Apenas contatos que optaram por receber mensagens',
    criteria: {
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
    },
  },
  new_7d: {
    label: 'Novos (7 dias)',
    description: 'Contatos criados nos últimos 7 dias com opt-in',
    criteria: {
      status: 'OPT_IN',
      includeTag: null,
      createdWithinDays: 7,
      excludeOptOut: true,
      noTags: false,
      uf: null,
      ddi: null,
      customFieldKey: null,
      customFieldMode: null,
      customFieldValue: null,
    },
  },
  tag_top: {
    label: 'Tag Principal',
    description: 'Contatos com a tag mais comum',
    criteria: {
      status: 'OPT_IN',
      includeTag: null, // Will be set dynamically
      createdWithinDays: null,
      excludeOptOut: true,
      noTags: false,
      uf: null,
      ddi: null,
      customFieldKey: null,
      customFieldMode: null,
      customFieldValue: null,
    },
    requiresOptions: true,
  },
  no_tags: {
    label: 'Sem Tags',
    description: 'Contatos que não possuem nenhuma tag',
    criteria: {
      status: 'OPT_IN',
      includeTag: null,
      createdWithinDays: null,
      excludeOptOut: true,
      noTags: true,
      uf: null,
      ddi: null,
      customFieldKey: null,
      customFieldMode: null,
      customFieldValue: null,
    },
  },
  manual: {
    label: 'Seleção Manual',
    description: 'Selecione contatos individualmente',
    criteria: {
      status: 'ALL',
      includeTag: null,
      createdWithinDays: null,
      excludeOptOut: false,
      noTags: false,
      uf: null,
      ddi: null,
      customFieldKey: null,
      customFieldMode: null,
      customFieldValue: null,
    },
  },
}

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Gets the configuration for a specific preset.
 *
 * @param preset - The preset identifier
 * @returns PresetConfig or undefined if preset is 'test' or invalid
 *
 * @example
 * ```typescript
 * const config = getPresetConfig('opt_in')
 * console.log(config.label) // 'Opt-in'
 * ```
 */
export function getPresetConfig(preset: AudiencePresetId): PresetConfig | undefined {
  if (preset === 'test') return undefined
  return AUDIENCE_PRESETS[preset]
}

/**
 * Gets the criteria for a specific preset.
 *
 * For presets that require options (like tag_top), the options
 * will be merged into the criteria.
 *
 * @param preset - The preset identifier
 * @param options - Optional configuration (e.g., topTag for tag_top)
 * @returns The audience criteria for the preset
 *
 * @example
 * ```typescript
 * const criteria = getPresetCriteria('tag_top', { topTag: 'VIP' })
 * console.log(criteria.includeTag) // 'VIP'
 * ```
 */
export function getPresetCriteria(
  preset: AudiencePresetId,
  options?: PresetOptions
): AudienceCriteria {
  if (preset === 'test') {
    return createDefaultCriteria()
  }

  const config = AUDIENCE_PRESETS[preset]
  if (!config) {
    return createDefaultCriteria()
  }

  const criteria = { ...config.criteria }

  // Apply dynamic options
  if (preset === 'tag_top' && options?.topTag) {
    criteria.includeTag = options.topTag
  }

  return criteria
}

/**
 * Applies a preset to a list of contacts and returns matching IDs.
 *
 * This is the main function for applying presets. It handles:
 * - Regular presets: Returns IDs of matching contacts
 * - tag_top fallback: Falls back to opt_in if no topTag available
 * - manual: Returns empty array (user selects manually)
 * - test: Returns empty array (test contact handled separately)
 *
 * @param preset - The preset to apply
 * @param contacts - List of contacts to filter
 * @param suppressedPhones - Set of suppressed phone numbers
 * @param options - Optional configuration
 * @returns PresetResult with matching contact IDs
 *
 * @example
 * ```typescript
 * const result = applyPreset('new_7d', contacts, suppressedPhones)
 * console.log(`${result.contactIds.length} contacts match`)
 * ```
 */
export function applyPreset(
  preset: AudiencePresetId,
  contacts: Contact[],
  suppressedPhones: Set<string>,
  options?: PresetOptions
): PresetResult {
  // Test preset: handled separately in the UI
  if (preset === 'test') {
    return {
      preset: 'test',
      criteria: createDefaultCriteria(),
      contactIds: [],
    }
  }

  // Manual preset: user selects contacts individually
  if (preset === 'manual') {
    return {
      preset: 'manual',
      criteria: AUDIENCE_PRESETS.manual.criteria,
      contactIds: [],
    }
  }

  // tag_top fallback: if no topTag, fall back to opt_in
  if (preset === 'tag_top' && !options?.topTag) {
    const fallbackCriteria = AUDIENCE_PRESETS.opt_in.criteria
    const contactIds = getContactIdsByCriteria(contacts, fallbackCriteria, suppressedPhones)
    return {
      preset: 'tag_top',
      criteria: fallbackCriteria,
      contactIds,
      fallbackPreset: 'opt_in',
    }
  }

  // Regular preset application
  const criteria = getPresetCriteria(preset, options)
  const contactIds = getContactIdsByCriteria(contacts, criteria, suppressedPhones)

  return {
    preset,
    criteria,
    contactIds,
  }
}

/**
 * Gets all available preset options for display in UI.
 *
 * @param includeTest - Whether to include the test preset
 * @returns Array of preset options with id, label, and description
 *
 * @example
 * ```typescript
 * const options = getPresetOptions()
 * // Use in a select dropdown
 * options.map(opt => <option value={opt.id}>{opt.label}</option>)
 * ```
 */
export function getPresetOptions(
  includeTest = false
): Array<{ id: AudiencePresetId; label: string; description: string }> {
  const options = Object.entries(AUDIENCE_PRESETS).map(([id, config]) => ({
    id: id as AudiencePresetId,
    label: config.label,
    description: config.description,
  }))

  if (includeTest) {
    options.push({
      id: 'test',
      label: 'Contato de Teste',
      description: 'Enviar apenas para o contato de teste configurado',
    })
  }

  return options
}

/**
 * Checks if a preset requires additional options to work correctly.
 *
 * @param preset - The preset to check
 * @returns True if the preset requires options
 *
 * @example
 * ```typescript
 * if (presetRequiresOptions('tag_top')) {
 *   // Compute topTag before applying
 * }
 * ```
 */
export function presetRequiresOptions(preset: AudiencePresetId): boolean {
  if (preset === 'test') return false
  const config = AUDIENCE_PRESETS[preset]
  return config?.requiresOptions ?? false
}
