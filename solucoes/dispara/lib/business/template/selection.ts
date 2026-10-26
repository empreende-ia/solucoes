/**
 * Template Selection Module
 *
 * Pure functions for managing template selection state.
 * This module contains no side effects and can be safely used in any context.
 */

import type { Template, GeneratedTemplate } from '@/types/template.types'

// =============================================================================
// Functions
// =============================================================================

/**
 * Toggles a single template in the selection set.
 * Returns a new Set with the template added or removed.
 *
 * @param selectedIds - Current set of selected IDs
 * @param templateId - ID to toggle
 * @returns New Set with the ID toggled
 *
 * @example
 * ```ts
 * const newSelection = toggleTemplateSelection(selected, 'template-123')
 * setSelected(newSelection)
 * ```
 */
export function toggleTemplateSelection(
  selectedIds: Set<string>,
  templateId: string
): Set<string> {
  const next = new Set(selectedIds)

  if (next.has(templateId)) {
    next.delete(templateId)
  } else {
    next.add(templateId)
  }

  return next
}

/**
 * Selects all templates if not all are selected, otherwise clears selection.
 * Uses template IDs for the selection.
 *
 * @param templates - Array of templates to select from
 * @param currentSelected - Current set of selected IDs
 * @returns New Set with all template IDs or empty Set
 *
 * @example
 * ```ts
 * const newSelection = selectAllTemplates(templates, selected)
 * setSelected(newSelection)
 * ```
 */
export function selectAllTemplates(
  templates: Template[],
  currentSelected: Set<string>
): Set<string> {
  if (templates.length === 0) {
    return new Set()
  }

  // If all are already selected, clear selection
  if (currentSelected.size === templates.length) {
    return new Set()
  }

  // Otherwise, select all
  return new Set(templates.map((t) => t.id))
}

/**
 * Selects all templates by name if not all are selected, otherwise clears selection.
 * Uses template names for the selection (for Meta template operations).
 *
 * @param templates - Array of templates to select from
 * @param currentSelected - Current set of selected names
 * @returns New Set with all template names or empty Set
 *
 * @example
 * ```ts
 * const newSelection = selectAllTemplatesByName(templates, selectedNames)
 * setSelected(newSelection)
 * ```
 */
export function selectAllTemplatesByName(
  templates: Template[],
  currentSelected: Set<string>
): Set<string> {
  if (templates.length === 0) {
    return new Set()
  }

  // If all are already selected, clear selection
  if (currentSelected.size === templates.length) {
    return new Set()
  }

  // Otherwise, select all
  return new Set(templates.map((t) => t.name))
}

/**
 * Selects all generated templates if not all are selected, otherwise clears selection.
 *
 * @param templates - Array of generated templates to select from
 * @param currentSelected - Current set of selected IDs
 * @returns New Set with all template IDs or empty Set
 *
 * @example
 * ```ts
 * const newSelection = selectAllGeneratedTemplates(generated, selected)
 * setSelected(newSelection)
 * ```
 */
export function selectAllGeneratedTemplates(
  templates: GeneratedTemplate[],
  currentSelected: Set<string>
): Set<string> {
  if (templates.length === 0) {
    return new Set()
  }

  // If all are already selected, clear selection
  if (currentSelected.size === templates.length) {
    return new Set()
  }

  // Otherwise, select all
  return new Set(templates.map((t) => t.id))
}

/**
 * Creates a new empty selection Set.
 * Utility function for clearing selections.
 *
 * @returns Empty Set
 *
 * @example
 * ```ts
 * setSelected(clearSelection())
 * ```
 */
export function clearSelection(): Set<string> {
  return new Set()
}

/**
 * Removes IDs from selection that are no longer present in the valid ID set.
 * Useful for cleaning up selection when items are deleted.
 *
 * @param currentSelected - Current set of selected IDs
 * @param validIds - Set of currently valid IDs
 * @returns New Set containing only IDs that exist in validIds
 *
 * @example
 * ```ts
 * const cleanedSelection = pruneSelection(selected, manualDraftIds)
 * setSelected(cleanedSelection)
 * ```
 */
export function pruneSelection(
  currentSelected: Set<string>,
  validIds: Set<string>
): Set<string> {
  if (currentSelected.size === 0) return currentSelected

  const next = new Set<string>()

  for (const id of currentSelected) {
    if (validIds.has(id)) {
      next.add(id)
    }
  }

  return next
}

/**
 * Removes a single ID from the selection.
 * Returns the same Set if ID is not present.
 *
 * @param selectedIds - Current set of selected IDs
 * @param idToRemove - ID to remove from selection
 * @returns New Set without the specified ID
 *
 * @example
 * ```ts
 * const newSelection = removeFromSelection(selected, deletedId)
 * setSelected(newSelection)
 * ```
 */
export function removeFromSelection(
  selectedIds: Set<string>,
  idToRemove: string
): Set<string> {
  if (!selectedIds.has(idToRemove)) return selectedIds

  const next = new Set(selectedIds)
  next.delete(idToRemove)
  return next
}

/**
 * Checks if all items from a list are selected.
 *
 * @param selectedIds - Current set of selected IDs
 * @param allIds - Array of all IDs to check against
 * @returns True if all IDs are selected
 *
 * @example
 * ```ts
 * const allSelected = areAllSelected(selected, templates.map(t => t.id))
 * ```
 */
export function areAllSelected(
  selectedIds: Set<string>,
  allIds: string[]
): boolean {
  if (allIds.length === 0) return false
  return selectedIds.size === allIds.length && allIds.every((id) => selectedIds.has(id))
}

/**
 * Extracts IDs from a Set into an array.
 * Useful for API calls that expect arrays.
 *
 * @param selectedIds - Set of selected IDs
 * @returns Array of selected IDs
 *
 * @example
 * ```ts
 * const idsArray = getSelectedAsArray(selected)
 * await bulkDeleteMutation.mutate(idsArray)
 * ```
 */
export function getSelectedAsArray(selectedIds: Set<string>): string[] {
  return Array.from(selectedIds)
}
