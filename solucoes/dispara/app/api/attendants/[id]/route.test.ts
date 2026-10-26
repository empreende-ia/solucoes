// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { applyPrincipalHeaders, type Principal } from '@/lib/principal'

/**
 * PATCH /api/attendants/[id]: desativar o atendente também apaga as push
 * subscriptions ligadas ao token (o aparelho dele para de receber push).
 */

type QueryResult = { data: unknown; error: unknown }
type Call = { table: string; method: string; args: unknown[] }

const mocks = vi.hoisted(() => {
  const state: { calls: Call[]; update: QueryResult; pushDelete: QueryResult } = {
    calls: [],
    update: { data: null, error: null },
    pushDelete: { data: null, error: null },
  }
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'update', 'delete']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        state.calls.push({ table, method, args })
        return builder
      })
    }
    builder.single = vi.fn(() => Promise.resolve(state.update))
    builder.then = (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(table === 'push_subscriptions' ? state.pushDelete : state.update).then(onFulfilled, onRejected)
    return builder
  })
  return { state, from, clearAttendantAuthCache: vi.fn() }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
  getSupabaseAdmin: () => ({ from: mocks.from }),
}))

vi.mock('@/lib/attendant-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/attendant-auth')>()
  return { ...actual, clearAttendantAuthCache: mocks.clearAttendantAuthCache }
})

import { PATCH } from '@/app/api/attendants/[id]/route'

const SESSION: Principal = { kind: 'session' }

function patch(body: unknown): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' })
  applyPrincipalHeaders(headers, SESSION)
  const request = new NextRequest(new URL('/api/attendants/att-1', 'http://localhost'), {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  return PATCH(request, { params: Promise.resolve({ id: 'att-1' }) })
}

function pushDeletes(): Call[] {
  return mocks.state.calls.filter((call) => call.table === 'push_subscriptions')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.calls = []
  mocks.state.update = { data: { id: 'att-1', is_active: false }, error: null }
  mocks.state.pushDelete = { data: null, error: null }
})

describe('PATCH /api/attendants/[id]', () => {
  // Cenário do achado: depois de desativado, o aparelho do atendente seguia
  // recebendo push com o nome do contato e a prévia da mensagem.
  it('desativar: apaga as push subscriptions do token', async () => {
    const res = await patch({ is_active: false })

    expect(res.status).toBe(200)
    expect(mocks.clearAttendantAuthCache).toHaveBeenCalled()
    expect(pushDeletes().map((call) => [call.method, ...call.args])).toEqual([
      ['delete'],
      ['eq', 'attendant_token_id', 'att-1'],
    ])
  })

  it('só renomear/mudar permissões: não mexe nas push subscriptions', async () => {
    mocks.state.update = { data: { id: 'att-1', is_active: true }, error: null }

    const res = await patch({ name: 'Ana Paula', permissions: { canView: true, canReply: false, canHandoff: false } })

    expect(res.status).toBe(200)
    expect(pushDeletes()).toHaveLength(0)
  })

  it('reativar: não apaga nada', async () => {
    mocks.state.update = { data: { id: 'att-1', is_active: true }, error: null }

    await patch({ is_active: true })

    expect(pushDeletes()).toHaveLength(0)
  })

  it('falha ao apagar as subscriptions não derruba a desativação (o envio já ignora token inativo)', async () => {
    mocks.state.pushDelete = { data: null, error: { message: 'boom' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await patch({ is_active: false })

    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('erro ao atualizar o token: 500 e não apaga subscriptions', async () => {
    mocks.state.update = { data: null, error: { message: 'boom' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await patch({ is_active: false })

    expect(res.status).toBe(500)
    expect(pushDeletes()).toHaveLength(0)
    spy.mockRestore()
  })
})
