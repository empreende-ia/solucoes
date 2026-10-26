import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type BroadcastHandler = (message: unknown) => void

const broadcastHandlers: BroadcastHandler[] = []
const channelTopics: string[] = []
const bindingTypes: string[] = []

const fakeChannel = {
  on: vi.fn((type: string, filter: { event?: string }, handler: BroadcastHandler) => {
    bindingTypes.push(type)
    if (type === 'broadcast' && filter?.event === 'db_change') broadcastHandlers.push(handler)
    return fakeChannel
  }),
  subscribe: vi.fn(() => fakeChannel),
}

const fakeClient = {
  channel: vi.fn((topic: string) => {
    channelTopics.push(topic)
    return fakeChannel
  }),
  removeChannel: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({ getSupabaseBrowser: () => fakeClient }))

import {
  CentralizedRealtimeProvider,
  useRealtimeSubscription,
  type RealtimeEvent,
} from '@/components/providers/CentralizedRealtimeProvider'
import { __resetDbChangesHubForTests } from '@/lib/supabase-realtime'

function emit(payload: Record<string, unknown>) {
  act(() => {
    for (const handler of broadcastHandlers) {
      handler({ type: 'broadcast', event: 'db_change', payload })
    }
  })
}

function Listener({ table, onEvent }: { table: string; onEvent: (e: RealtimeEvent) => void }) {
  useRealtimeSubscription(table, onEvent)
  return null
}

function setup(onEvent: (e: RealtimeEvent) => void, table = 'inbox_messages') {
  const queryClient = new QueryClient()
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
  // Callback estável (useRealtimeSubscription re-assina se a referência mudar)
  const stableOnEvent = vi.fn(onEvent)
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <CentralizedRealtimeProvider debounceMs={5}>
        <Listener table={table} onEvent={stableOnEvent} />
      </CentralizedRealtimeProvider>
    </QueryClientProvider>
  )
  const invalidatedKeys = () =>
    invalidateSpy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey[0])
  return { ...utils, invalidateSpy, invalidatedKeys, onEvent: stableOnEvent }
}

beforeEach(() => {
  __resetDbChangesHubForTests()
  broadcastHandlers.length = 0
  channelTopics.length = 0
  bindingTypes.length = 0
  fakeClient.channel.mockClear()
  fakeClient.removeChannel.mockClear()
})

describe('CentralizedRealtimeProvider (broadcast dispara-db)', () => {
  it('assina o canal compartilhado via broadcast, sem postgres_changes', () => {
    setup(() => {})
    expect(channelTopics).toEqual(['dispara-db'])
    expect(bindingTypes).toEqual(['broadcast'])
  })

  it('mapeia o broadcast para o RealtimeEvent {table, eventType, new, old}', () => {
    const received: RealtimeEvent[] = []
    setup((e) => received.push(e))

    emit({
      table: 'inbox_messages',
      eventType: 'INSERT',
      new: { id: 'm1', conversation_id: 'conv1', direction: 'inbound', delivery_status: 'delivered' },
      old: null,
      commit_timestamp: '2026-10-11T10:00:00Z',
    })

    expect(received).toEqual([
      {
        table: 'inbox_messages',
        eventType: 'INSERT',
        new: { id: 'm1', conversation_id: 'conv1', direction: 'inbound', delivery_status: 'delivered' },
        old: null,
      },
    ])
  })

  it('mantém as invalidações de query (debounced) por tabela', async () => {
    const { invalidatedKeys } = setup(() => {})

    emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: 'm1', conversation_id: 'c1' }, old: null })

    await waitFor(() => {
      expect(invalidatedKeys()).toEqual(
        expect.arrayContaining(['inbox_messages', 'inbox-messages', 'inbox-unread-count'])
      )
    })
  })

  it('mensagem nova (recebida ou resposta humana) também atualiza a lista de conversas', async () => {
    // O banco não publica INSERT de conversa nem o contador de saída da conversa:
    // a lista (ordem, prévia, conversa nova) depende do evento da mensagem.
    const { invalidatedKeys } = setup(() => {})

    emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: 'm1', conversation_id: 'c1' }, old: null })

    await waitFor(() => {
      expect(invalidatedKeys()).toContain('inbox-conversations')
    })
  })

  it('mensagem nova também atualiza o detalhe da conversa aberta (total, último horário, contato)', async () => {
    // O UPDATE de inbox_conversations só publica status/modo/não lidas; o resto do
    // cabeçalho do detalhe depende do evento da mensagem.
    const { invalidatedKeys } = setup(() => {})

    emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: 'm1', conversation_id: 'c1' }, old: null })

    await waitFor(() => {
      expect(invalidatedKeys()).toContain('inbox-conversation')
    })
  })

  it('contacts (trigger por statement, sem linhas) invalida lista e estatísticas', async () => {
    const received: RealtimeEvent[] = []
    const { invalidatedKeys } = setup((e) => received.push(e), 'contacts')

    emit({ table: 'contacts', eventType: 'INSERT', new: null, old: null })

    expect(received).toEqual([{ table: 'contacts', eventType: 'INSERT', new: null, old: null }])
    await waitFor(() => {
      expect(invalidatedKeys()).toEqual(expect.arrayContaining(['contacts', 'contactStats', 'contactTags']))
    })
  })

  it('ignora tabelas fora da lista do provider e mensagens fora do contrato', async () => {
    const onEvent = vi.fn()
    const { invalidateSpy } = setup(onEvent, 'account_alerts')

    // account_alerts é tratado pelo useAccountAlerts, não pelo provider
    emit({ table: 'account_alerts', eventType: 'INSERT', new: { id: 'a1' }, old: null })
    // forjado / fora do contrato
    emit({ table: 'attendant_tokens', eventType: 'INSERT', new: { id: 't' }, old: null })

    await new Promise((r) => setTimeout(r, 20))
    expect(onEvent).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('sob flood (eventos a cada 100ms, forjáveis no canal público) ainda invalida periodicamente', () => {
    vi.useFakeTimers()
    try {
      const queryClient = new QueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
      const onEvent = vi.fn()
      render(
        <QueryClientProvider client={queryClient}>
          <CentralizedRealtimeProvider>
            <Listener table="inbox_conversations" onEvent={onEvent} />
          </CentralizedRealtimeProvider>
        </QueryClientProvider>
      )

      for (let elapsed = 0; elapsed < 3000; elapsed += 100) {
        emit({ table: 'inbox_conversations', eventType: 'UPDATE', new: { id: `conv_${elapsed}` }, old: null })
        act(() => {
          vi.advanceTimersByTime(100)
        })
      }

      const listInvalidations = invalidateSpy.mock.calls.filter(
        (call) => (call[0] as { queryKey: unknown[] }).queryKey[0] === 'inbox-conversations'
      )
      // Debounce só-trailing ficava adiado para sempre (0 invalidações durante o flood)
      expect(listInvalidations.length).toBeGreaterThanOrEqual(2)
      // ...e o flood não vira uma invalidação por evento
      expect(listInvalidations.length).toBeLessThanOrEqual(4)
      // Os assinantes recebem lotes por janela, não os 30 eventos um a um na hora
      expect(onEvent.mock.calls.length).toBeLessThanOrEqual(30)
    } finally {
      __resetDbChangesHubForTests()
      vi.useRealTimers()
    }
  })

  it('para de entregar após desmontar (sem remover o canal compartilhado)', () => {
    const onEvent = vi.fn()
    const { unmount } = setup(onEvent)
    unmount()

    emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: 'm1', conversation_id: 'c1' }, old: null })
    expect(onEvent).not.toHaveBeenCalled()
    expect(fakeClient.removeChannel).not.toHaveBeenCalled()
  })
})
