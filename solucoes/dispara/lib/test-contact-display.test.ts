import { describe, expect, it } from 'vitest'
import { getTestContactLabel } from './test-contact-display'

describe('getTestContactLabel', () => {
  it('não deve duplicar + quando o telefone já está em E.164', () => {
    const label = getTestContactLabel({ name: 'Teste', phone: '+5511999999999' })
    expect(label).toBe('Teste • +5511999999999')
    expect(label.includes('++')).toBe(false)
  })

  it('usa fallback de nome quando não vem definido', () => {
    const label = getTestContactLabel({ phone: '+5511999999999' })
    expect(label).toBe('Contato de Teste • +5511999999999')
  })
})
