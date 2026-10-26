/**
 * Template Filtering Module
 *
 * Pure functions for filtering templates and manual drafts.
 * This module contains no side effects and can be safely used in any context.
 */

import type { Template } from '@/types'
import type { ManualDraftTemplate } from '@/services/manualDraftsService'

// =============================================================================
// Types
// =============================================================================

/**
 * Criteria for filtering templates.
 * All fields are optional - only non-empty values are applied.
 */
export interface TemplateFilterCriteria {
  /** Search term to match against template name and content */
  searchTerm?: string
  /** Category to filter by (e.g., 'MARKETING', 'UTILITY'). Use 'ALL' to skip filter. */
  category?: string
  /** Status to filter by (e.g., 'APPROVED', 'DRAFT'). Use 'ALL' to skip filter. */
  status?: string
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Filters templates based on search term, category, and status.
 *
 * @param templates - Array of templates to filter
 * @param criteria - Filter criteria (all optional)
 * @returns Filtered array of templates
 *
 * @example
 * ```ts
 * const filtered = filterTemplates(templates, {
 *   searchTerm: 'welcome',
 *   category: 'MARKETING',
 *   status: 'APPROVED'
 * })
 * ```
 */
export function filterTemplates(
  templates: Template[],
  criteria: TemplateFilterCriteria
): Template[] {
  const { searchTerm = '', category = 'ALL', status = 'ALL' } = criteria
  const normalizedSearch = searchTerm.toLowerCase()

  return templates.filter((template) => {
    // Search term filter: matches against name or content
    const matchesSearch =
      !normalizedSearch ||
      template.name.toLowerCase().includes(normalizedSearch) ||
      template.content.toLowerCase().includes(normalizedSearch)

    // Category filter: 'ALL' skips this filter
    const matchesCategory = category === 'ALL' || template.category === category

    // Status filter: 'ALL' skips this filter
    const matchesStatus = status === 'ALL' || template.status === status

    return matchesSearch && matchesCategory && matchesStatus
  })
}

/**
 * Filters manual drafts based on a search term.
 *
 * @param drafts - Array of manual draft templates to filter
 * @param searchTerm - Search term to match against draft name
 * @returns Filtered array of manual drafts
 *
 * @example
 * ```ts
 * const filtered = filterManualDrafts(drafts, 'order')
 * ```
 */
export function filterManualDrafts(
  drafts: ManualDraftTemplate[],
  searchTerm: string
): ManualDraftTemplate[] {
  if (!searchTerm) return drafts

  const normalizedSearch = searchTerm.toLowerCase()

  return drafts.filter((draft) =>
    draft.name.toLowerCase().includes(normalizedSearch)
  )
}

/**
 * Filters templates to return only those whose IDs are in the provided set.
 *
 * @param templates - Array of templates to filter
 * @param draftIds - Set of draft IDs to match against
 * @returns Array of templates that are manual drafts
 *
 * @example
 * ```ts
 * const manualDrafts = filterByDraftIds(templates, manualDraftIds)
 * ```
 */
export function filterByDraftIds(
  templates: Template[],
  draftIds: Set<string>
): Template[] {
  return templates.filter((template) => draftIds.has(template.id))
}

/**
 * Filters templates to exclude those whose IDs are in the provided set.
 * Useful for getting only Meta-selectable templates (non-manual-drafts).
 *
 * @param templates - Array of templates to filter
 * @param excludeIds - Set of IDs to exclude
 * @returns Array of templates excluding the specified IDs
 *
 * @example
 * ```ts
 * const metaTemplates = filterExcludingIds(templates, manualDraftIds)
 * ```
 */
export function filterExcludingIds(
  templates: Template[],
  excludeIds: Set<string>
): Template[] {
  return templates.filter((template) => !excludeIds.has(template.id))
}
