import { describe, expect, it } from 'vitest'
import { canonicalTemplateCategory } from './template-category'

describe('canonicalTemplateCategory', () => {
  it('maps Meta categories to app categories', () => {
    expect(canonicalTemplateCategory('UTILITY')).toBe('UTILIDADE')
    expect(canonicalTemplateCategory('AUTHENTICATION')).toBe('AUTENTICACAO')
    expect(canonicalTemplateCategory('MARKETING')).toBe('MARKETING')
  })

  it('is tolerant to casing/whitespace', () => {
    expect(canonicalTemplateCategory(' utility ')).toBe('UTILIDADE')
    expect(canonicalTemplateCategory('authentication')).toBe('AUTENTICACAO')
  })

  it('handles already-canonical tokens', () => {
    expect(canonicalTemplateCategory('UTILIDADE')).toBe('UTILIDADE')
    expect(canonicalTemplateCategory('AUTENTICACAO')).toBe('AUTENTICACAO')
  })
})
