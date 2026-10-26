// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { applyPrincipalHeaders, type Principal } from '@/lib/principal'

/**
 * /api/push/subscribe|unsubscribe: a subscription fica ligada a quem se inscreveu
 * (attendant_token_id), para o envio ignorar atendentes revogados e o atendente
 * não mexer na subscription do dono.
 */

type QueryResult = { data: unknown; error: unknown }
type Call = { table: string; method: string; args: unknown[] }

const mocks = vi.hoisted(() => {
  const state: { calls: Call[]; lookup: QueryResult; write: QueryResult } = {
    calls: [],
    lookup: { data: null, error: null },
    write: { data: null, error: null },
  }
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'delete', 'upsert']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        state.calls.push({ table, method, args })
        return builder
      })
    }
    builder.maybeSingle = vi.fn(() => Promise.resolve(state.lookup))
    builder.then = (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(state.write).then(onFulfilled, onRejected)
    return builder
  })
  return { state, from }
})

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ from: mocks.from }),
}))

import { POST as subscribe } from '@/app/api/push/subscribe/route'
import { POST as unsubscribe } from '@/app/api/push/unsubscribe/route'

const ENDPOINT = 'https://push.example/abc'
const SUBSCRIPTION = { endpoint: ENDPOINT, keys: { p256dh: 'x', auth: 'y' } }

const ATTENDANT: Principal = {
  kind: 'attendant',
  attendant: { id: 'att-1', name: 'Ana', permissions: { canView: true, canReply: false, canHandoff: false } },
}
const SESSION: Principal = { kind: 'session' }

function request(path: string, principal: Principal, body: unknown): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json', 'user-agent': 'vitest' })
  applyPrincipalHeaders(headers, principal)
  return new NextRequest(new URL(path, 'http://localhost'), { method: 'POST', headers, body: JSON.stringify(body) })
}

function callsOf(method: string): Call[] {
  return mocks.state.calls.filter((call) => call.method === method)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.calls = []
  mocks.state.lookup = { data: null, error: null }
  mocks.state.write = { data: null, error: null }
})

describe('POST /api/push/subscribe', () => {
  // Cenário do achado: antes a linha do atendente ficava com attendant_token_id NULL
  // (igual à do dono) e continuava recebendo push depois da revogação.
  it('atendente: grava a subscription ligada ao próprio token', async () => {
    const res = await subscribe(request('/api/push/subscribe', ATTENDANT, SUBSCRIPTION))

    expect(res.status).toBe(200)
    const [upsert] = callsOf('upsert')
    expect(upsert.table).toBe('push_subscriptions')
    expect(upsert.args[0]).toMatchObject({ endpoint: ENDPOINT, keys: SUBSCRIPTION.keys, attendant_token_id: 'att-1' })
    expect(upsert.args[1]).toEqual({ onConflict: 'endpoint' })
  })

  it('dono: grava com attendant_token_id NULL', async () => {
    const res = await subscribe(request('/api/push/subscribe', SESSION, SUBSCRIPTION))

    expect(res.status).toBe(200)
    expect(callsOf('select')).toHaveLength(0)
    expect(callsOf('upsert')[0].args[0]).toMatchObject({ endpoint: ENDPOINT, attendant_token_id: null })
  })

  it('atendente não toma o endpoint que já é do dono (mesmo navegador)', async () => {
    mocks.state.lookup = { data: { attendant_token_id: null }, error: null }

    const res = await subscribe(request('/api/push/subscribe', ATTENDANT, SUBSCRIPTION))

    expect(res.status).toBe(200)
    expect(callsOf('upsert')).toHaveLength(0)
  })

  it('atendente reassume um endpoint que era de outro atendente', async () => {
    mocks.state.lookup = { data: { attendant_token_id: 'att-old' }, error: null }

    const res = await subscribe(request('/api/push/subscribe', ATTENDANT, SUBSCRIPTION))

    expect(res.status).toBe(200)
    expect(callsOf('upsert')[0].args[0]).toMatchObject({ attendant_token_id: 'att-1' })
  })

  it('erro ao consultar o endpoint: 500 sem gravar', async () => {
    mocks.state.lookup = { data: null, error: { message: 'boom' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await subscribe(request('/api/push/subscribe', ATTENDANT, SUBSCRIPTION))

    expect(res.status).toBe(500)
    expect(callsOf('upsert')).toHaveLength(0)
    spy.mockRestore()
  })
})

describe('POST /api/push/unsubscribe', () => {
  it('atendente só remove a subscription ligada ao próprio token', async () => {
    const res = await unsubscribe(request('/api/push/unsubscribe', ATTENDANT, { endpoint: ENDPOINT }))

    expect(res.status).toBe(200)
    expect(callsOf('delete')).toHaveLength(1)
    expect(callsOf('eq').map((call) => call.args)).toEqual([
      ['endpoint', ENDPOINT],
      ['attendant_token_id', 'att-1'],
    ])
  })

  it('dono remove pelo endpoint', async () => {
    const res = await unsubscribe(request('/api/push/unsubscribe', SESSION, { endpoint: ENDPOINT }))

    expect(res.status).toBe(200)
    expect(callsOf('eq').map((call) => call.args)).toEqual([['endpoint', ENDPOINT]])
  })
})
