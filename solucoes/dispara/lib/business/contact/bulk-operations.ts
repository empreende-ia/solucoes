/**
 * Contact Bulk Operations
 *
 * Pure functions for bulk contact operations including:
 * - Data normalization for updates
 * - Selection state management
 *
 * All functions are pure and produce no side effects.
 *
 * @module lib/business/contact/bulk-operations
 */

/**
 * Normaliza email para update (trim, null se vazio).
 *
 * @param email - Email para normalizar (pode ser undefined, null ou string)
 * @returns String trimada se não vazia, null caso contrário
 *
 * @example
 * ```ts
 * normalizeEmailForUpdate('  user@example.com  ') // 'user@example.com'
 * normalizeEmailForUpdate('   ') // null
 * normalizeEmailForUpdate(null) // null
 * normalizeEmailForUpdate(undefined) // null
 * ```
 */
export function normalizeEmailForUpdate(email?: string | null): string | null {
  const trimmed = (email ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Sanitiza custom fields removendo valores vazios/undefined.
 *
 * Remove entries onde o valor é:
 * - undefined
 * - null
 * - string vazia (após trim)
 *
 * @param fields - Objeto de custom fields para sanitizar
 * @returns Objeto sanitizado ou undefined se input for undefined
 *
 * @example
 * ```ts
 * sanitizeCustomFieldsForUpdate({
 *   name: 'John',
 *   empty: '',
 *   nullVal: null,
 *   undef: undefined,
 *   number: 42
 * })
 * // { name: 'John', number: 42 }
 *
 * sanitizeCustomFieldsForUpdate(undefined) // undefined
 * ```
 */
export function sanitizeCustomFieldsForUpdate(
  fields?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!fields) return fields

  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    out[key] = value
  }

  return out
}

/**
 * Toggle seleção de um contato.
 *
 * Se o contato está selecionado, remove da seleção.
 * Se não está, adiciona à seleção.
 *
 * @param selectedIds - Set atual de IDs selecionados
 * @param contactId - ID do contato para toggle
 * @returns Novo Set com a seleção atualizada
 *
 * @example
 * ```ts
 * const selected = new Set(['a', 'b'])
 * toggleContactSelection(selected, 'b') // Set(['a'])
 * toggleContactSelection(selected, 'c') // Set(['a', 'b', 'c'])
 * ```
 */
export function toggleContactSelection(
  selectedIds: Set<string>,
  contactId: string
): Set<string> {
  const newSet = new Set(selectedIds)

  if (newSet.has(contactId)) {
    newSet.delete(contactId)
  } else {
    newSet.add(contactId)
  }

  return newSet
}

/**
 * Seleciona/deseleciona todos os contatos da página atual.
 *
 * Se todos os contatos da página estão selecionados, remove-os.
 * Caso contrário, adiciona todos à seleção.
 *
 * @param selectedIds - Set atual de IDs selecionados
 * @param pageContactIds - Array de IDs dos contatos da página atual
 * @param allSelected - Se todos os contatos da página já estão selecionados
 * @returns Novo Set com a seleção atualizada
 *
 * @example
 * ```ts
 * const selected = new Set(['a'])
 * const pageIds = ['b', 'c']
 *
 * // Adiciona todos da página
 * toggleSelectAllContacts(selected, pageIds, false) // Set(['a', 'b', 'c'])
 *
 * // Remove todos da página
 * const allSelected = new Set(['a', 'b', 'c'])
 * toggleSelectAllContacts(allSelected, pageIds, true) // Set(['a'])
 * ```
 */
export function toggleSelectAllContacts(
  selectedIds: Set<string>,
  pageContactIds: string[],
  allSelected: boolean
): Set<string> {
  if (pageContactIds.length === 0) {
    return selectedIds
  }

  const newSet = new Set(selectedIds)

  if (allSelected) {
    // Remove todos da página
    for (const id of pageContactIds) {
      newSet.delete(id)
    }
  } else {
    // Adiciona todos da página
    for (const id of pageContactIds) {
      newSet.add(id)
    }
  }

  return newSet
}

/**
 * Seleciona todos os contatos globalmente.
 *
 * @param allContactIds - Array com todos os IDs de contatos
 * @returns Novo Set contendo todos os IDs
 *
 * @example
 * ```ts
 * selectAllContactsGlobal(['a', 'b', 'c']) // Set(['a', 'b', 'c'])
 * selectAllContactsGlobal([]) // Set([])
 * ```
 */
export function selectAllContactsGlobal(allContactIds: string[]): Set<string> {
  return new Set(allContactIds)
}

/**
 * Limpa seleção.
 *
 * @returns Novo Set vazio
 *
 * @example
 * ```ts
 * clearContactSelection() // Set([])
 * ```
 */
export function clearContactSelection(): Set<string> {
  return new Set()
}
