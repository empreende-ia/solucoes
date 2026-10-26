import { nanoid } from 'nanoid'
import { FlowFormFieldType, normalizeFlowFieldName } from '@/lib/flow-form'

/**
 * Creates a new field with default values based on type
 */
export function createNewField(type: FlowFormFieldType): any {
  const id = `q_${nanoid(8)}`
  const baseLabel = type === 'optin' ? 'Quero receber novidades' : 'Nova pergunta'
  const baseSlug = normalizeFlowFieldName(baseLabel) || 'campo'
  const suffix = nanoid(4).toLowerCase()
  const name = normalizeFlowFieldName(`${baseSlug}_${suffix}`) || `${baseSlug}_${suffix}`

  const field: any = {
    id,
    type,
    label: baseLabel,
    name,
    required: type === 'optin' ? false : true,
  }

  if (type === 'optin') {
    field.text = 'Quero receber mensagens sobre novidades e promoções.'
  }

  if (type === 'dropdown' || type === 'single_choice' || type === 'multi_choice') {
    field.options = [
      { id: 'opcao_1', title: 'Opção 1' },
      { id: 'opcao_2', title: 'Opção 2' },
    ]
    field.required = false
  }

  if (type === 'date') {
    field.required = true
  }

  return field
}

/**
 * Moves an item in an array from one index to another
 */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Creates default options for choice-type fields
 */
export function createDefaultOptions() {
  return [
    { id: 'opcao_1', title: 'Opção 1' },
    { id: 'opcao_2', title: 'Opção 2' },
  ]
}

/**
 * Checks if a field type requires options
 */
export function fieldTypeRequiresOptions(type: FlowFormFieldType): boolean {
  return type === 'dropdown' || type === 'single_choice' || type === 'multi_choice'
}
