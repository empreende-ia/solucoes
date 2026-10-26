// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * lib/attendant-auth: cache do principal do atendente.
 * O TTL positivo é o que limita a janela pós-revogação no proxy (clearAttendantAuthCache
 * não alcança a cópia do módulo que roda no bundle do proxy).
 */

type QueryResult = { data: unknown; error: unknown }

const mocks = vi.hoisted(() => {
  const state: { result: QueryResult } = { result: { data: null, error: null } }
  const maybeSingle = vi.fn(() => Promise.resolve(state.result))
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = maybeSingle
    return builder
  })
  return { state, from, maybeSingle }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}))

import { clearAttendantAuthCache, resolveAttendantTokenDetailed } from '@/lib/attendant-auth'

const TOKEN = '0123456789abcdef0123456789abcdef'
const T0 = new Date('2026-10-11T12:00:00.000Z').getTime()

function row(overrides: Record<string, unknown> = {}): QueryResult {
  return {
    data: {
      id: 'att-1',
      name: 'Ana',
      permissions: { canView: true, canReply: true, canHandoff: false },
      is_active: true,
      expires_at: null,
      ...overrides,
    },
    error: null,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  clearAttendantAuthCache()
  mocks.maybeSingle.mockClear()
  mocks.state.result = row()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('resolveAttendantTokenDetailed: janela pós-revogação', () => {
  // Cenário do achado: o dono desativa o atendente (ou tira canReply). O cache do
  // proxy não é limpo pelo PATCH; antes a revogação levava até 30s para valer lá.
  it('desativado no banco: o positivo cacheado vale no máximo 5s', async () => {
    expect((await resolveAttendantTokenDetailed(TOKEN)).status).toBe('valid')

    mocks.state.result = row({ is_active: false })

    vi.setSystemTime(T0 + 4_999)
    expect((await resolveAttendantTokenDetailed(TOKEN)).status).toBe('valid')

    vi.setSystemTime(T0 + 5_001)
    expect((await resolveAttendantTokenDetailed(TOKEN)).status).toBe('invalid')
  })

  it('permissão rebaixada (canReply=false) vale em até 5s', async () => {
    const before = await resolveAttendantTokenDetailed(TOKEN)
    expect(before.status === 'valid' && before.principal.permissions.canReply).toBe(true)

    mocks.state.result = row({ permissions: { canView: true, canReply: false, canHandoff: false } })
    vi.setSystemTime(T0 + 5_001)

    const after = await resolveAttendantTokenDetailed(TOKEN)
    expect(after.status === 'valid' && after.principal.permissions.canReply).toBe(false)
  })

  it('clearAttendantAuthCache derruba o positivo desta cópia do módulo na hora', async () => {
    await resolveAttendantTokenDetailed(TOKEN)
    mocks.state.result = row({ is_active: false })

    clearAttendantAuthCache()

    expect((await resolveAttendantTokenDetailed(TOKEN)).status).toBe('invalid')
  })
})

describe('resolveAttendantTokenDetailed: banco indisponível', () => {
  it('sem positivo anterior: unavailable (não invalid)', async () => {
    mocks.state.result = { data: null, error: { message: 'TypeError: fetch failed' } }
    expect((await resolveAttendantTokenDetailed(TOKEN)).status).toBe('unavailable')
  })

  it('com positivo recente: serve o último principal (stale-if-error), mesmo com o TTL curto', async () => {
    expect((await resolveAttendantTokenDetailed(TOKEN)).status).toBe('valid')

    mocks.state.result = { data: null, error: { message: 'TypeError: fetch failed' } }
    vi.setSystemTime(T0 + 60_000)
    expect((await resolveAttendantTokenDetailed(TOKEN)).status).toBe('valid')

    vi.setSystemTime(T0 + 5 * 60_000 + 1)
    expect((await resolveAttendantTokenDetailed(TOKEN)).status).toBe('unavailable')
  })
})
