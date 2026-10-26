// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Envio de push: só para o dono e para atendentes com token ativo, não expirado e
 * com permissão de visualizar (canView). Atendente desativado/expirado/removido ou
 * sem canView não recebe nome do contato nem prévia.
 */

type QueryResult = { data: unknown; error: unknown }

const mocks = vi.hoisted(() => {
  const state: { subscriptions: QueryResult; tokens: QueryResult; tokenIds: unknown[] } = {
    subscriptions: { data: [], error: null },
    tokens: { data: [], error: null },
    tokenIds: [],
  }
  const select = vi.fn()
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((columns: string) => {
      select(columns)
      return builder
    })
    builder.in = vi.fn((_column: string, ids: unknown[]) => {
      state.tokenIds = ids
      return builder
    })
    builder.delete = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.then = (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) =>
      Promise.resolve(table === 'attendant_tokens' ? state.tokens : state.subscriptions).then(
        onFulfilled,
        onRejected
      )
    return builder
  })
  return {
    state,
    from,
    select,
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
  }
})

vi.mock('web-push', () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails,
    generateVAPIDKeys: vi.fn(),
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ from: mocks.from }),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import { broadcastPushNotification, loadDeliverablePushSubscriptions } from '@/lib/push-notifications'

const KEYS = { p256dh: 'p', auth: 'a' }
const NOW = new Date('2026-10-11T12:00:00.000Z').getTime()

function sub(endpoint: string, attendantTokenId: string | null) {
  return { endpoint, keys: KEYS, attendant_token_id: attendantTokenId }
}

const SUBSCRIPTIONS = [
  sub('https://push.example/owner', null),
  sub('https://push.example/active', 'att-active'),
  sub('https://push.example/revoked', 'att-revoked'),
  sub('https://push.example/expired', 'att-expired'),
  sub('https://push.example/deleted', 'att-deleted'),
  sub('https://push.example/future', 'att-future'),
  sub('https://push.example/no-view', 'att-no-view'),
  sub('https://push.example/no-permissions', 'att-no-permissions'),
]

const CAN_VIEW = { canView: true, canReply: true, canHandoff: false }

const TOKENS = [
  { id: 'att-active', is_active: true, expires_at: null, permissions: CAN_VIEW },
  { id: 'att-revoked', is_active: false, expires_at: null, permissions: CAN_VIEW },
  { id: 'att-expired', is_active: true, expires_at: new Date(NOW - 1_000).toISOString(), permissions: CAN_VIEW },
  { id: 'att-future', is_active: true, expires_at: new Date(NOW + 60_000).toISOString(), permissions: CAN_VIEW },
  // Dono tirou o canView (PATCH /api/attendants/:id) e manteve o atendente ativo
  { id: 'att-no-view', is_active: true, expires_at: null, permissions: { canView: false, canReply: false, canHandoff: false } },
  { id: 'att-no-permissions', is_active: true, expires_at: null, permissions: null },
]

const client = () => ({ from: mocks.from }) as unknown as SupabaseClient

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.state.subscriptions = { data: SUBSCRIPTIONS, error: null }
  mocks.state.tokens = { data: TOKENS, error: null }
  mocks.state.tokenIds = []
  mocks.sendNotification.mockResolvedValue({ statusCode: 201 })
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('loadDeliverablePushSubscriptions', () => {
  it('dono sempre; atendente só com token ativo, não expirado e com canView', async () => {
    const result = await loadDeliverablePushSubscriptions(client())

    expect(result.map((s) => s.endpoint)).toEqual([
      'https://push.example/owner',
      'https://push.example/active',
      'https://push.example/future',
    ])
    expect(result[0]).toEqual({ endpoint: 'https://push.example/owner', keys: KEYS })
    expect(mocks.state.tokenIds).toEqual([
      'att-active',
      'att-revoked',
      'att-expired',
      'att-deleted',
      'att-future',
      'att-no-view',
      'att-no-permissions',
    ])
  })

  // Cenário do achado: o subscribe exige canView, mas o envio só olhava is_active/expires_at.
  // O dono tira o canView e mantém o atendente ativo → o aparelho seguia recebendo
  // nome do contato e prévia (que a PWA já responde com 403).
  it('atendente ativo que perdeu o canView não recebe mais push', async () => {
    mocks.state.subscriptions = {
      data: [sub('https://push.example/owner', null), sub('https://push.example/no-view', 'att-no-view')],
      error: null,
    }

    const result = await loadDeliverablePushSubscriptions(client())

    expect(result.map((s) => s.endpoint)).toEqual(['https://push.example/owner'])
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('permissions'))
  })

  it('permissions em formato inesperado conta como sem canView (fail-closed)', async () => {
    mocks.state.tokens = {
      data: [
        { id: 'att-active', is_active: true, expires_at: null, permissions: 'canView' },
        { id: 'att-future', is_active: true, expires_at: null, permissions: { canView: 'true' } },
      ],
      error: null,
    }

    const result = await loadDeliverablePushSubscriptions(client())

    expect(result.map((s) => s.endpoint)).toEqual(['https://push.example/owner'])
  })

  it('erro ao checar os tokens: envia só para o dono (fail-closed)', async () => {
    mocks.state.tokens = { data: null, error: { message: 'boom' } }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await loadDeliverablePushSubscriptions(client())

    expect(result.map((s) => s.endpoint)).toEqual(['https://push.example/owner'])
  })

  it('só subscriptions do dono: não consulta attendant_tokens', async () => {
    mocks.state.subscriptions = { data: [sub('https://push.example/owner', null)], error: null }

    const result = await loadDeliverablePushSubscriptions(client())

    expect(result).toHaveLength(1)
    expect(mocks.from).not.toHaveBeenCalledWith('attendant_tokens')
  })
})

describe('broadcastPushNotification', () => {
  // Cenário do achado: atendente desativado continuava recebendo o push de
  // sendNewMessageNotification (nome do contato + prévia de 100 caracteres).
  it('não envia para o aparelho de atendente desativado/expirado/removido/sem canView', async () => {
    const result = await broadcastPushNotification({ title: 'Maria', body: 'Oi, tudo bem?' })

    const endpoints = mocks.sendNotification.mock.calls.map(([subscription]) => subscription.endpoint)
    expect(endpoints).toEqual([
      'https://push.example/owner',
      'https://push.example/active',
      'https://push.example/future',
    ])
    expect(result).toEqual({ sent: 3, failed: 0 })
  })
})
