import type { TestContact } from '../types'

export function getTestContactLabel(testContact: TestContact): string {
  const name = testContact.name?.trim() || 'Contato de Teste'
  return `${name} • ${testContact.phone}`
}
