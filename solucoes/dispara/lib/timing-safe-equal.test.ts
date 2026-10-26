// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'

describe('timingSafeEqualString', () => {
  it('true para strings iguais', () => {
    expect(timingSafeEqualString('abc-123', 'abc-123')).toBe(true)
    expect(timingSafeEqualString('ção 🇧🇷', 'ção 🇧🇷')).toBe(true)
  })

  it('false para strings diferentes, inclusive de tamanhos diferentes', () => {
    expect(timingSafeEqualString('abc-123', 'abc-124')).toBe(false)
    expect(timingSafeEqualString('abc', 'abc-123')).toBe(false)
    expect(timingSafeEqualString('ABC', 'abc')).toBe(false)
  })

  it('fail-closed: vazio/ausente nunca casa, nem com outro vazio', () => {
    expect(timingSafeEqualString('', '')).toBe(false)
    expect(timingSafeEqualString(null, null)).toBe(false)
    expect(timingSafeEqualString(undefined, 'x')).toBe(false)
    expect(timingSafeEqualString('x', null)).toBe(false)
    expect(timingSafeEqualString('', 'x')).toBe(false)
  })
})
