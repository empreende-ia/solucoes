import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryCalls: Array<[string, ...unknown[]]> = []
let queryResult: { count: number | null; error: unknown } = { count: 0, error: null }
let adminConfigured = true

function makeQuery() {
  const query = {
    select: vi.fn((...args: unknown[]) => {
      queryCalls.push(['select', ...args])
      return query
    }),
    gt: vi.fn((...args: unknown[]) => {
      queryCalls.push(['gt', ...args])
      return query
    }),
    eq: vi.fn((...args: unknown[]) => {
      queryCalls.push(['eq', ...args])
      return query
    }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(queryResult).then(resolve, reject),
  }
  return query
}

const fakeAdmin = {
  from: vi.fn((table: string) => {
    queryCalls.push(['from', table])
    return makeQuery()
  }),
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => (adminConfigured ? fakeAdmin : null),
}))

import { GET } from '@/app/api/inbox/unread-count/route'

function request(principal?: string) {
  const headers = new Headers()
  if (principal) headers.set('x-dispara-principal', principal)
  return new Request('http://localhost/api/inbox/unread-count', { headers })
}

beforeEach(() => {
  queryCalls.length = 0
  queryResult = { count: 0, error: null }
  adminConfigured = true
  fakeAdmin.from.mockClear()
})

describe('GET /api/inbox/unread-count', () => {
  it('sem principal resolvido pelo proxy → 401 (fail-closed) e não toca no banco', async () => {
    const res = await GET(request())
    expect(res.status).toBe(401)
    expect(fakeAdmin.from).not.toHaveBeenCalled()
  })

  it('atendente/cron/public não podem → 403/401', async () => {
    expect((await GET(request('cron'))).status).toBe(403)
    expect((await GET(request('public'))).status).toBe(401)
    expect(fakeAdmin.from).not.toHaveBeenCalled()
  })

  it('dono: conta conversas abertas com não lidas via service role', async () => {
    queryResult = { count: 7, error: null }
    const res = await GET(request('session'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ count: 7 })
    expect(queryCalls).toEqual([
      ['from', 'inbox_conversations'],
      ['select', 'id', { count: 'exact', head: true }],
      ['gt', 'unread_count', 0],
      ['eq', 'status', 'open'],
    ])
  })

  it('API key também pode', async () => {
    queryResult = { count: null, error: null }
    const res = await GET(request('api_key'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 0 })
  })

  it('erro do banco → 500 sem vazar detalhe', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    queryResult = { count: null, error: { message: 'permission denied for table inbox_conversations' } }
    const res = await GET(request('session'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('permission denied')
    errorSpy.mockRestore()
  })

  it('Supabase não configurado → 503', async () => {
    adminConfigured = false
    const res = await GET(request('session'))
    expect(res.status).toBe(503)
  })
})
