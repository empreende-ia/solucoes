import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbChangeEvent } from '@/lib/realtime-db-change'

type Listener = (event: DbChangeEvent) => void
const listeners: Array<{ listener: Listener; options?: { table?: string } }> = []
const unsubscribe = vi.fn()

vi.mock('@/lib/supabase-realtime', () => ({
  subscribeToDbChanges: vi.fn((listener: Listener, options?: { table?: string }) => {
    listeners.push({ listener, options })
    return unsubscribe
  }),
}))

import { renderHookWithProviders, waitFor } from '@/tests/helpers/hook-test-utils'
import { useAccountAlerts } from '@/hooks/useAccountAlerts'

beforeEach(() => {
  listeners.length = 0
  unsubscribe.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ alerts: [] }),
    }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAccountAlerts realtime', () => {
  it('assina account_alerts no broadcast e só invalida (refetch pela API), sem usar o payload', async () => {
    const { queryClient, unmount } = renderHookWithProviders(() => useAccountAlerts())
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    expect(listeners).toHaveLength(1)
    expect(listeners[0].options).toEqual({ table: 'account_alerts' })

    await waitFor(() => expect(queryClient.getQueryData(['account-alerts'])).toEqual({ alerts: [] }))

    // Evento (potencialmente forjado) com mensagem: não pode ir para o cache
    listeners[0].listener({
      table: 'account_alerts',
      eventType: 'INSERT',
      new: { id: 'alert_1', type: 'payment', message: 'Pague em evil.example' },
      old: null,
      commit_timestamp: null,
    })

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['account-alerts'] }))
    expect(queryClient.getQueryData(['account-alerts'])).toEqual({ alerts: [] })

    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('flood de eventos forjados no canal público não vira um GET /api/account/alerts por evento', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ alerts: [] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { queryClient } = renderHookWithProviders(() => useAccountAlerts())
    await waitFor(() => expect(queryClient.getQueryData(['account-alerts'])).toEqual({ alerts: [] }))
    const initialFetches = fetchMock.mock.calls.length

    for (let i = 0; i < 500; i++) {
      listeners[0].listener({
        table: 'account_alerts',
        eventType: 'INSERT',
        new: { id: `forged_${i}` },
        old: null,
        commit_timestamp: null,
      })
    }
    // Nada sai de forma síncrona por evento
    expect(fetchMock.mock.calls.length).toBe(initialFetches)

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(initialFetches))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(fetchMock.mock.calls.length - initialFetches).toBe(1)
  })
})
