import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RealtimePayload } from '@/types'

const callbacks: Array<(payload: RealtimePayload) => void> = []
const subscribeToTable = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-realtime', () => ({
  createRealtimeChannel: vi.fn(() => ({})),
  subscribeToTable: subscribeToTable.mockImplementation(
    (_channel: unknown, _table: string, _event: string, cb: (payload: RealtimePayload) => void) => {
      callbacks.push(cb)
    }
  ),
  activateChannel: vi.fn(() => Promise.resolve()),
  removeChannel: vi.fn(),
}))

import { useRealtimeQuery } from '@/hooks/useRealtimeQuery'

function conversationUpdate(id: string): RealtimePayload {
  return {
    schema: 'public',
    table: 'inbox_conversations',
    commit_timestamp: '',
    eventType: 'UPDATE',
    new: { id },
    old: { id },
    errors: null,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  callbacks.length = 0
  subscribeToTable.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRealtimeQuery sob flood de eventos', () => {
  it('invalida periodicamente (maxWait), não 1x por evento, e não recria a assinatura a cada render', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { rerender } = renderHook(
      () =>
        useRealtimeQuery({
          // array literal: nova referência a cada render
          queryKey: ['inbox-conversations', { page: 1 }],
          queryFn: async () => 1,
          table: 'inbox_conversations',
        }),
      { wrapper }
    )
    await act(async () => {
      await Promise.resolve()
    })

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()

    // 1 evento a cada 50ms durante 3s (canal público: qualquer um consegue emitir)
    for (let elapsed = 0; elapsed < 3000; elapsed += 50) {
      act(() => {
        callbacks.at(-1)?.(conversationUpdate(`conv_${elapsed}`))
        vi.advanceTimersByTime(50)
      })
      rerender()
    }

    // Uma assinatura só (o cleanup a cada render cancelava a invalidação pendente)
    expect(subscribeToTable).toHaveBeenCalledTimes(1)

    // Debounce só-trailing de 200ms ficava adiado para sempre: 0 invalidações
    const calls = invalidateSpy.mock.calls.length
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(calls).toBeLessThanOrEqual(4)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox-conversations', { page: 1 }] })
  })
})
