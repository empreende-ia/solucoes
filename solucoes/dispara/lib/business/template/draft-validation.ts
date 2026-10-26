/**
 * Draft Validation Module
 *
 * Pure functions for validating manual draft templates.
 * This module contains no side effects and can be safely used in any context.
 */

import type { ManualDraftTemplate } from '@/services/manualDraftsService'
import { CreateTemplateSchema } from '@/lib/whatsapp/validators/template.schema'

// =============================================================================
// Types
// =============================================================================

/**
 * Represents the send state of a manual draft.
 * Indicates whether the draft can be submitted to Meta and why.
 */
export interface DraftSendState {
  /** Whether the draft can be sent to Meta */
  canSend: boolean
  /** Human-readable reason if draft cannot be sent */
  reason?: string
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Validates a single manual draft template against Meta requirements.
 *
 * @param draft - The manual draft to validate
 * @returns The send state indicating if the draft can be submitted
 *
 * @example
 * ```ts
 * const state = validateManualDraft(draft)
 * if (!state.canSend) {
 *   console.log('Cannot send:', state.reason)
 * }
 * ```
 */
export function validateManualDraft(draft: ManualDraftTemplate): DraftSendState {
  // Rule: to send to Meta, we need a valid spec.
  // Old/buggy templates may not have spec; in those cases, force user to open/save in editor.
  if (!draft?.spec) {
    return {
      canSend: false,
      reason: 'Rascunho incompleto: abra e salve no editor antes de enviar.',
    }
  }

  const parsed = CreateTemplateSchema.safeParse(draft.spec)

  if (parsed.success) {
    return { canSend: true }
  }

  // Extract first error and format message
  const firstIssue = parsed.error.issues?.[0]
  const baseMessage = firstIssue?.message || 'Template invalido.'

  // Add helpful hint for common Meta error about edge parameters
  const hint = baseMessage.toLowerCase().includes('nao pode comecar')
    ? `${baseMessage} (Meta: 2388299)`
    : baseMessage

  return {
    canSend: false,
    reason: hint,
  }
}

/**
 * Computes send states for multiple manual drafts at once.
 * Returns a map of draft ID to send state for efficient lookup.
 *
 * @param drafts - Array of manual drafts to validate
 * @returns Record mapping draft IDs to their send states
 *
 * @example
 * ```ts
 * const states = computeDraftSendStates(drafts)
 * const canSendDraft = states[draftId]?.canSend ?? false
 * ```
 */
export function computeDraftSendStates(
  drafts: ManualDraftTemplate[]
): Record<string, DraftSendState> {
  const result: Record<string, DraftSendState> = {}

  for (const draft of drafts) {
    result[draft.id] = validateManualDraft(draft)
  }

  return result
}

/**
 * Checks if a specific draft can be sent based on precomputed states.
 * Returns false if the draft ID is not found in the states map.
 *
 * @param states - Precomputed draft send states
 * @param draftId - ID of the draft to check
 * @returns Whether the draft can be sent
 *
 * @example
 * ```ts
 * const states = computeDraftSendStates(drafts)
 * if (canSendDraft(states, draftId)) {
 *   submitDraft(draftId)
 * }
 * ```
 */
export function canSendDraft(
  states: Record<string, DraftSendState>,
  draftId: string
): boolean {
  return states[draftId]?.canSend ?? false
}

/**
 * Gets the reason why a draft cannot be sent.
 * Returns undefined if the draft can be sent or is not found.
 *
 * @param states - Precomputed draft send states
 * @param draftId - ID of the draft to check
 * @returns The reason string or undefined
 *
 * @example
 * ```ts
 * const reason = getDraftBlockReason(states, draftId)
 * if (reason) {
 *   showError(reason)
 * }
 * ```
 */
export function getDraftBlockReason(
  states: Record<string, DraftSendState>,
  draftId: string
): string | undefined {
  const state = states[draftId]
  if (!state || state.canSend) return undefined
  return state.reason
}
