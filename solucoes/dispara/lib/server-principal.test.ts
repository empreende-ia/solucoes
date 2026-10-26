// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPrincipalHeaders, type Principal } from '@/lib/principal'

/**
 * Defesa em profundidade dos loaders RSC / Server Actions do dashboard: sem principal
 * de dono (modo degradado com banco fora, erro de política), não consultam o banco
 * com service role e devolvem null — a página renderiza só o shell.
 */

// server-only barra a importação em ambiente de teste; neutraliza.
vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock('next/headers', () => ({
  headers: async () => state.headers,
}))

const db = vi.hoisted(() => {
  // Query builder encadeável: qualquer método devolve o builder; await resolve vazio.
  const createBuilder = () => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'not', 'gte', 'order', 'limit', 'range', 'or', 'in']) {
      builder[method] = () => builder
    }
    builder.then = (onFulfilled?: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled)
    return builder
  }
  const client = {
    from: vi.fn(() => createBuilder()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }
  return { client, createClient: vi.fn(async () => client), getSupabaseAdmin: vi.fn(() => client) }
})

vi.mock('@/lib/supabase-server', () => ({ createClient: db.createClient }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: db.getSupabaseAdmin }))

import { getServerPrincipal, hasOwnerPrincipal } from '@/lib/server-principal'
import { getDashboardData } from '@/app/(dashboard)/actions/dashboard'
import { getCampaignsInitialData } from '@/app/(dashboard)/campaigns/actions'
import { getContactsInitialData } from '@/app/(dashboard)/contacts/actions'
import { getFormsInitialData } from '@/app/(dashboard)/forms/actions'
import { getInboxInitialData } from '@/app/(dashboard)/inbox/actions'
import { getSubmissionsInitialData } from '@/app/(dashboard)/submissions/actions'

function setPrincipal(principal: Principal | null, extra: Record<string, string> = {}) {
  const headers = new Headers(extra)
  if (principal) applyPrincipalHeaders(headers, principal)
  state.headers = headers
}

const LOADERS: Array<[string, () => Promise<unknown>]> = [
  ['getDashboardData', () => getDashboardData()],
  ['getCampaignsInitialData', () => getCampaignsInitialData()],
  ['getContactsInitialData', () => getContactsInitialData()],
  ['getFormsInitialData', () => getFormsInitialData()],
  ['getInboxInitialData', () => getInboxInitialData()],
  ['getSubmissionsInitialData', () => getSubmissionsInitialData({})],
]

describe('server-principal', () => {
  beforeEach(() => {
    db.client.from.mockClear()
    db.client.rpc.mockClear()
    db.createClient.mockClear()
    db.getSupabaseAdmin.mockClear()
  })

  it('lê o principal gravado pelo proxy', async () => {
    setPrincipal({ kind: 'session' })
    expect(await getServerPrincipal()).toEqual({ kind: 'session' })
    expect(await hasOwnerPrincipal()).toBe(true)

    setPrincipal({ kind: 'api_key' })
    expect(await hasOwnerPrincipal()).toBe(true)
  })

  it('public, atendente, cron ou sem principal → não é dono', async () => {
    for (const principal of [
      { kind: 'public' },
      { kind: 'cron' },
      { kind: 'attendant', attendant: { id: 'a1', name: 'Ana', permissions: { canView: true, canReply: true, canHandoff: true } } },
    ] as Principal[]) {
      setPrincipal(principal)
      expect(await hasOwnerPrincipal(), principal.kind).toBe(false)
    }
    setPrincipal(null)
    expect(await getServerPrincipal()).toBeNull()
    expect(await hasOwnerPrincipal()).toBe(false)
    // Valor desconhecido no header também não vale.
    setPrincipal(null, { 'x-dispara-principal': 'root' })
    expect(await hasOwnerPrincipal()).toBe(false)
  })

  it.each(LOADERS)('%s sem principal de dono (modo degradado) → null, sem tocar no banco', async (_name, load) => {
    // Cenário do achado: banco oscilou, o proxy deixou a página abrir com principal public.
    setPrincipal({ kind: 'public' })
    expect(await load()).toBeNull()
    expect(db.createClient).not.toHaveBeenCalled()
    expect(db.getSupabaseAdmin).not.toHaveBeenCalled()
    expect(db.client.from).not.toHaveBeenCalled()
  })

  it.each(LOADERS)('%s sem headers do proxy → null (fail-closed)', async (_name, load) => {
    setPrincipal(null)
    expect(await load()).toBeNull()
    expect(db.client.from).not.toHaveBeenCalled()
  })

  it.each(LOADERS)('%s com sessão do dono consulta o banco normalmente', async (_name, load) => {
    setPrincipal({ kind: 'session' })
    expect(await load()).not.toBeNull()
    expect(db.client.from).toHaveBeenCalled()
  })
})
