import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { createRealtimeInvalidator } from '@/lib/realtime-invalidation'

function fakeQueryClient() {
  const fetching = new Set<string>()
  const client = {
    isFetching: vi.fn(({ queryKey }: { queryKey: unknown[] }) => (fetching.has(String(queryKey[0])) ? 1 : 0)),
    invalidateQueries: vi.fn(async () => {}),
  }
  return { client, queryClient: client as unknown as QueryClient, fetching }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createRealtimeInvalidator', () => {
  it('agrupa as query keys e invalida cada uma uma vez depois do debounce', () => {
    const { client, queryClient } = fakeQueryClient()
    const invalidator = createRealtimeInvalidator(queryClient, { waitMs: 200 })

    invalidator.invalidate(['campaigns'])
    invalidator.invalidate(['campaignStats'])
    invalidator.invalidate(['campaigns'])
    expect(client.invalidateQueries).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(client.invalidateQueries).toHaveBeenCalledTimes(2)
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['campaigns'] })
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['campaignStats'] })
  })

  it('sob flood de sinais (a cada 50ms) invalida no máximo 1x por maxWait, mas nunca deixa de invalidar', () => {
    const { client, queryClient } = fakeQueryClient()
    const invalidator = createRealtimeInvalidator(queryClient, { waitMs: 200, maxWaitMs: 1000 })

    for (let elapsed = 0; elapsed < 5000; elapsed += 50) {
      invalidator.invalidate(['inbox-messages', 'conv1'])
      vi.advanceTimersByTime(50)
    }

    const calls = client.invalidateQueries.mock.calls.length
    expect(calls).toBeGreaterThanOrEqual(4)
    expect(calls).toBeLessThanOrEqual(5)
  })

  it('não cancela um fetch em curso: adia a invalidação até ele terminar', () => {
    const { client, queryClient, fetching } = fakeQueryClient()
    const invalidator = createRealtimeInvalidator(queryClient, { waitMs: 100, maxWaitMs: 500 })

    fetching.add('account-alerts')
    invalidator.invalidate(['account-alerts'])
    vi.advanceTimersByTime(1000)
    expect(client.invalidateQueries).not.toHaveBeenCalled()

    // O fetch terminou: a mudança sinalizada durante ele não se perde
    fetching.delete('account-alerts')
    vi.advanceTimersByTime(100)
    expect(client.invalidateQueries).toHaveBeenCalledTimes(1)
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['account-alerts'] })
  })

  it('cancel descarta o que estava pendente', () => {
    const { client, queryClient } = fakeQueryClient()
    const invalidator = createRealtimeInvalidator(queryClient, { waitMs: 100 })

    invalidator.invalidate(['templates'])
    invalidator.cancel()
    vi.advanceTimersByTime(1000)
    expect(client.invalidateQueries).not.toHaveBeenCalled()
  })
})
