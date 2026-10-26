import { beforeEach, describe, expect, it, vi } from 'vitest'

// server-only barra a importação em ambiente de teste; neutraliza.
vi.mock('server-only', () => ({}))

const connection = vi.fn(async () => undefined)
vi.mock('next/server', () => ({ connection: () => connection() }))

const adminClient = { from: vi.fn(), rpc: vi.fn() }
let adminConfigured = true
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => (adminConfigured ? adminClient : null),
}))

import { createClient } from '@/lib/supabase-server'

beforeEach(() => {
  adminConfigured = true
  connection.mockClear()
})

describe('lib/supabase-server createClient', () => {
  it('devolve o client service role (não a chave publishable)', async () => {
    await expect(createClient()).resolves.toBe(adminClient)
  })

  it('marca a request como dinâmica (sem ISR/prerender com dados do banco)', async () => {
    await createClient()
    expect(connection).toHaveBeenCalledTimes(1)
  })

  it('sem service role configurada → erro claro', async () => {
    adminConfigured = false
    await expect(createClient()).rejects.toThrow(/SUPABASE_SECRET_KEY/)
  })
})
