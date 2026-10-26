import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimePayload } from '@/types'

interface Subscription {
  table: string
  event: string
  filter?: string
  cb: (payload: RealtimePayload) => void
}
const subscriptions: Subscription[] = []

vi.mock('@/lib/supabase-realtime', () => ({
  createRealtimeChannel: vi.fn(() => ({})),
  subscribeToTable: vi.fn(
    (_channel: unknown, table: string, event: string, cb: (payload: RealtimePayload) => void, filter?: string) => {
      subscriptions.push({ table, event, filter, cb })
    }
  ),
  activateChannel: vi.fn(() => Promise.resolve()),
  removeChannel: vi.fn(),
}))

const listMessages = vi.hoisted(() => vi.fn())
vi.mock('@/services/inboxService', () => ({
  inboxService: { listMessages },
}))

import { renderHookWithProviders, waitFor } from '@/tests/helpers/hook-test-utils'
import { getMessagesQueryKey, useMessages } from '@/hooks/useConversation'

function messagePayload(eventType: 'INSERT' | 'UPDATE', row: Record<string, unknown>): RealtimePayload {
  return {
    schema: 'public',
    table: 'inbox_messages',
    commit_timestamp: '',
    eventType,
    new: row,
    old: eventType === 'UPDATE' ? { id: row.id, conversation_id: row.conversation_id } : null,
    errors: null,
  }
}

function emit(event: 'INSERT' | 'UPDATE', row: Record<string, unknown>) {
  for (const sub of subscriptions) {
    if (sub.table === 'inbox_messages' && sub.event === event) sub.cb(messagePayload(event, row))
  }
}

const sentMessage = {
  id: 'm1',
  conversation_id: 'conv1',
  direction: 'outbound',
  content: 'Olá',
  message_type: 'text',
  delivery_status: 'sent',
  created_at: '2026-10-11T10:00:00Z',
}

beforeEach(() => {
  subscriptions.length = 0
  listMessages.mockReset()
  listMessages.mockResolvedValue({ messages: [sentMessage], hasMore: false })
})

describe('useMessages realtime (canal público: evento é só sinal)', () => {
  it('assina INSERT e UPDATE filtrados pela conversa', async () => {
    renderHookWithProviders(() => useMessages('conv1'))
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1))

    expect(subscriptions.map((s) => [s.table, s.event, s.filter])).toEqual([
      ['inbox_messages', 'INSERT', 'conversation_id=eq.conv1'],
      ['inbox_messages', 'UPDATE', 'conversation_id=eq.conv1'],
    ])
  })

  it('UPDATE forjado com delivery_status "read" NÃO marca a mensagem como lida no cache: refaz o fetch', async () => {
    const { result, queryClient } = renderHookWithProviders(() => useMessages('conv1'))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    emit('UPDATE', { id: 'm1', conversation_id: 'conv1', delivery_status: 'read' })

    // Nada do payload vai para o cache
    const cached = queryClient.getQueryData<{ pages: Array<{ messages: Array<{ delivery_status: string }> }> }>(
      getMessagesQueryKey('conv1')
    )
    expect(cached?.pages[0].messages[0].delivery_status).toBe('sent')
    expect(result.current.messages[0].delivery_status).toBe('sent')

    // O status real vem da API autenticada
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2))
    expect(result.current.messages[0].delivery_status).toBe('sent')
  })

  it('UPDATE legítimo: o novo status aparece depois do refetch', async () => {
    const { result } = renderHookWithProviders(() => useMessages('conv1'))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    listMessages.mockResolvedValue({ messages: [{ ...sentMessage, delivery_status: 'delivered' }], hasMore: false })
    emit('UPDATE', { id: 'm1', conversation_id: 'conv1', delivery_status: 'delivered' })

    await waitFor(() => expect(result.current.messages[0].delivery_status).toBe('delivered'))
  })

  it('flood de INSERT/UPDATE forjados não vira um fetch por evento', async () => {
    const { result } = renderHookWithProviders(() => useMessages('conv1'))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    for (let i = 0; i < 300; i++) {
      emit(i % 2 ? 'INSERT' : 'UPDATE', { id: `forged_${i}`, conversation_id: 'conv1', delivery_status: 'read' })
    }
    expect(listMessages).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(listMessages).toHaveBeenCalledTimes(2)
  })
})
