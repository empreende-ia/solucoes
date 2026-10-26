import type { LeadFormField } from '@/types'

/**
 * Converts a string to a URL-friendly slug
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80)
}

/**
 * Normalizes field order to ensure sequential indices
 */
export function normalizeFieldOrder(fields: LeadFormField[]): LeadFormField[] {
  return fields.map((f, idx) => ({ ...f, order: idx }))
}

/**
 * Moves an item from one index to another in an array
 */
export function moveItem<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return arr
  if (fromIndex < 0 || fromIndex >= arr.length) return arr
  if (toIndex < 0 || toIndex >= arr.length) return arr

  const next = [...arr]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

/**
 * Creates a new default field
 */
export function createDefaultField(fieldsLength: number): LeadFormField {
  return {
    key: `campo_${fieldsLength + 1}`,
    label: `Campo ${fieldsLength + 1}`,
    type: 'text',
    required: false,
    options: [],
    order: fieldsLength,
  }
}
