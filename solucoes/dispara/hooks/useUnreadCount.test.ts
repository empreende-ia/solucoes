import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHookWithProviders, waitFor } from '@/tests/helpers/hook-test-utils'
import { fetchUnreadCount, useUnreadCount } from '@/hooks/useUnreadCount'

function mockFetch(response: { ok: boolean; status?: number; json?: unknown }) {
  const fn = vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.json,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchUnreadCount', () => {
  it('lê a contagem da API autenticada (não do Supabase no browser)', async () => {
    const fetchMock = mockFetch({ ok: true, json: { count: 4 } })
    await expect(fetchUnreadCount()).resolves.toBe(4)
    expect(fetchMock).toHaveBeenCalledWith('/api/inbox/unread-count', { cache: 'no-store' })
  })

  it('401/500 → 0 (badge some, sidebar não quebra)', async () => {
    mockFetch({ ok: false, status: 401, json: { error: 'Unauthorized' } })
    await expect(fetchUnreadCount()).resolves.toBe(0)
  })

  it('payload inválido → 0', async () => {
    mockFetch({ ok: true, json: { count: 'muitos' } })
    await expect(fetchUnreadCount()).resolves.toBe(0)
    mockFetch({ ok: true, json: { count: -3 } })
    await expect(fetchUnreadCount()).resolves.toBe(0)
  })
})

describe('useUnreadCount', () => {
  it('expõe a contagem da API', async () => {
    mockFetch({ ok: true, json: { count: 2 } })
    const { result } = renderHookWithProviders(() => useUnreadCount())
    await waitFor(() => expect(result.current.count).toBe(2))
  })
})
