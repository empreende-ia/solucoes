import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type BroadcastHandler = (message: unknown) => void
type StatusHandler = (status: string) => void

interface FakeChannel {
  topic: string
  params: unknown
  broadcastHandlers: Array<{ event: string; handler: BroadcastHandler }>
  otherBindings: string[]
  statusHandler: StatusHandler | null
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

const channels: FakeChannel[] = []

function makeChannel(topic: string, params: unknown): FakeChannel {
  const channel: FakeChannel = {
    topic,
    params,
    broadcastHandlers: [],
    otherBindings: [],
    statusHandler: null,
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation((type: string, filter: { event?: string }, handler: BroadcastHandler) => {
    if (type === 'broadcast') channel.broadcastHandlers.push({ event: filter?.event ?? '*', handler })
    else channel.otherBindings.push(type)
    return channel
  })
  channel.subscribe.mockImplementation((cb?: StatusHandler) => {
    channel.statusHandler = cb ?? null
    return channel
  })
  return channel
}

const fakeClient = {
  channel: vi.fn((topic: string, params?: unknown) => {
    const channel = makeChannel(topic, params)
    channels.push(channel)
    return channel
  }),
  removeChannel: vi.fn(),
}

let supabaseConfigured = true

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowser: () => (supabaseConfigured ? fakeClient : null),
}))
vi.mock('./supabase', () => ({
  getSupabaseBrowser: () => (supabaseConfigured ? fakeClient : null),
}))

import {
  __resetDbChangesHubForTests,
  createRealtimeChannel,
  DB_CHANGE_MAX_ROWS_PER_WINDOW,
  DB_CHANGE_MAX_TRANSITIONS_PER_WINDOW,
  DB_CHANGE_WINDOW_MS,
  onDbChangesStatus,
  removeChannel,
  subscribeToDbChanges,
  subscribeToTable,
} from '@/lib/supabase-realtime'
import type { RealtimeChannel } from '@supabase/supabase-js'

function dbChannel(): FakeChannel {
  const found = channels.find((c) => c.topic === 'dispara-db')
  if (!found) throw new Error('canal dispara-db não criado')
  return found
}

function emit(payload: Record<string, unknown>) {
  const channel = dbChannel()
  for (const { event, handler } of channel.broadcastHandlers) {
    if (event === 'db_change') handler({ type: 'broadcast', event: 'db_change', payload })
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  __resetDbChangesHubForTests()
  channels.length = 0
  fakeClient.channel.mockClear()
  fakeClient.removeChannel.mockClear()
  supabaseConfigured = true
})

afterEach(() => {
  __resetDbChangesHubForTests()
  vi.useRealTimers()
})

describe('hub de mudanças do banco (broadcast dispara-db)', () => {
  it('cria UM canal público dispara-db, ouvindo só broadcast db_change (sem postgres_changes)', () => {
    const offA = subscribeToDbChanges(vi.fn())
    const offB = subscribeToDbChanges(vi.fn(), { table: 'campaigns' })

    const dbChannels = channels.filter((c) => c.topic === 'dispara-db')
    expect(dbChannels).toHaveLength(1)
    expect(dbChannels[0].params).toEqual({ config: { private: false } })
    expect(dbChannels[0].broadcastHandlers.map((b) => b.event)).toEqual(['db_change'])
    expect(dbChannels[0].otherBindings).toEqual([])
    expect(dbChannels[0].subscribe).toHaveBeenCalledTimes(1)

    offA()
    offB()
    // O canal compartilhado nunca é removido (evita a corrida de removeChannel assíncrono)
    expect(fakeClient.removeChannel).not.toHaveBeenCalled()
  })

  it('entrega por tabela, tipo de evento e filtro', () => {
    const all = vi.fn()
    const campaigns = vi.fn()
    const campaignUpdates = vi.fn()
    const oneCampaign = vi.fn()

    subscribeToDbChanges(all)
    subscribeToDbChanges(campaigns, { table: 'campaigns' })
    subscribeToDbChanges(campaignUpdates, { table: 'campaigns', event: 'UPDATE' })
    subscribeToDbChanges(oneCampaign, { table: 'campaigns', filter: 'id=eq.c_2' })

    emit({ table: 'campaigns', eventType: 'INSERT', new: { id: 'c_1', status: 'Rascunho' }, old: null })
    emit({ table: 'campaigns', eventType: 'UPDATE', new: { id: 'c_2', status: 'Enviando' }, old: { id: 'c_2' } })
    emit({ table: 'contacts', eventType: 'INSERT', new: null, old: null })

    // 1º evento de cada tabela sai na hora; o 2º de campaigns espera o fim da janela
    expect(all).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    expect(all).toHaveBeenCalledTimes(3)
    expect(campaigns).toHaveBeenCalledTimes(2)
    expect(campaignUpdates).toHaveBeenCalledTimes(1)
    expect(oneCampaign).toHaveBeenCalledTimes(1)
    expect(oneCampaign.mock.calls[0][0]).toMatchObject({ table: 'campaigns', eventType: 'UPDATE', new: { id: 'c_2' } })
  })

  it('descarta mensagens fora do contrato', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener)

    emit({ table: 'attendant_tokens', eventType: 'INSERT', new: { id: 'x' }, old: null })
    emit({ table: 'campaigns', eventType: 'HACK', new: { id: 'x' }, old: null })
    emit({ table: 'campaigns', eventType: 'INSERT', new: 'oops', old: null })

    expect(listener).not.toHaveBeenCalled()
  })

  it('isola erro de um listener', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = vi.fn(() => {
      throw new Error('boom')
    })
    const ok = vi.fn()
    subscribeToDbChanges(broken)
    subscribeToDbChanges(ok)

    emit({ table: 'flows', eventType: 'UPDATE', new: { id: 'fl_1' }, old: { id: 'fl_1' } })

    expect(ok).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('cancelar a assinatura para de entregar', () => {
    const listener = vi.fn()
    const off = subscribeToDbChanges(listener)
    off()
    emit({ table: 'templates', eventType: 'UPDATE', new: { id: 't' }, old: { id: 't' } })
    expect(listener).not.toHaveBeenCalled()
  })

  it('sem Supabase configurado devolve no-op e não cria canal', () => {
    supabaseConfigured = false
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const off = subscribeToDbChanges(vi.fn())
    expect(typeof off).toBe('function')
    expect(channels).toHaveLength(0)
    off()
    warnSpy.mockRestore()
  })

  it('propaga o status do canal compartilhado', () => {
    const statuses: string[] = []
    subscribeToDbChanges(vi.fn())
    onDbChangesStatus((s) => statuses.push(s))

    dbChannel().statusHandler?.('SUBSCRIBED')
    expect(statuses).toEqual(['SUBSCRIBED'])

    // Quem chega depois recebe o status atual na hora
    const late: string[] = []
    onDbChangesStatus((s) => late.push(s))
    expect(late).toEqual(['SUBSCRIBED'])
  })
})

describe('hub: coalescência por tabela (canal público, eventos forjáveis)', () => {
  let forgedSeq = 0
  function forgedAlert() {
    forgedSeq += 1
    emit({ table: 'account_alerts', eventType: 'INSERT', new: { id: `forged_${forgedSeq}` }, old: null })
  }

  it('flood forjado de 1000 eventos/s não vira 1000 entregas: no máximo 1 lote por janela', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener, { table: 'account_alerts' })

    // 1º evento sai na hora (leading)
    forgedAlert()
    expect(listener).toHaveBeenCalledTimes(1)

    // 999 eventos com ids aleatórios dentro da mesma janela: nada sai agora
    for (let i = 0; i < 999; i++) forgedAlert()
    expect(listener).toHaveBeenCalledTimes(1)

    // fim da janela: até N linhas distintas + 1 sinal genérico (o excesso)
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)
    expect(listener).toHaveBeenCalledTimes(1 + DB_CHANGE_MAX_ROWS_PER_WINDOW + 1)
    const overflow = listener.mock.calls.at(-1)![0]
    expect(overflow).toMatchObject({ table: 'account_alerts', eventType: 'INSERT', new: null, old: null })
  })

  it('sob rajada contínua entrega a cada janela (nunca adia para sempre)', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener, { table: 'inbox_messages' })

    // 1 evento a cada 50ms durante 5s, sempre a mesma linha
    const deliveriesPerSecond: number[] = []
    for (let second = 0; second < 5; second++) {
      const before = listener.mock.calls.length
      for (let tick = 0; tick < DB_CHANGE_WINDOW_MS / 50; tick++) {
        emit({ table: 'inbox_messages', eventType: 'UPDATE', new: { id: 'm1', conversation_id: 'c1' }, old: null })
        vi.advanceTimersByTime(50)
      }
      deliveriesPerSecond.push(listener.mock.calls.length - before)
    }

    for (const deliveries of deliveriesPerSecond) {
      expect(deliveries).toBeGreaterThanOrEqual(1)
      expect(deliveries).toBeLessThanOrEqual(2)
    }
  })

  it('mesma linha com conteúdo diferente: cada evento sai intacto (nada de fundir new/old)', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener, { table: 'campaigns' })

    emit({ table: 'campaigns', eventType: 'INSERT', new: { id: 'c_0' }, old: null }) // abre a janela
    const completion = {
      table: 'campaigns',
      eventType: 'UPDATE',
      new: { id: 'c_1', status: 'Concluído', delivered: 9 },
      old: { id: 'c_1', status: 'Enviando' },
    }
    const counter = {
      table: 'campaigns',
      eventType: 'UPDATE',
      new: { id: 'c_1', status: 'Concluído', delivered: 10 },
      old: { id: 'c_1', status: 'Concluído' },
    }
    emit(completion)
    emit(counter)
    emit(counter) // duplicata exata: colapsa
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener.mock.calls[1][0]).toMatchObject({ new: completion.new, old: completion.old })
    expect(listener.mock.calls[2][0]).toMatchObject({ new: counter.new, old: counter.old })
  })

  it('replay forjado com o id real e outro campaign_id não tira o INSERT legítimo do assinante filtrado', () => {
    const panel = vi.fn()
    subscribeToDbChanges(panel, { table: 'flow_submissions', event: 'INSERT', filter: 'campaign_id=eq.c1' })

    // atacante mantém a janela aberta e reenvia o id legítimo com outro campaign_id
    emit({ table: 'flow_submissions', eventType: 'INSERT', new: { id: 'forged_0', campaign_id: 'zzz' }, old: null })
    emit({ table: 'flow_submissions', eventType: 'INSERT', new: { id: 's1', campaign_id: 'c1' }, old: null })
    emit({ table: 'flow_submissions', eventType: 'INSERT', new: { id: 's1', campaign_id: 'zzz' }, old: null })
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    expect(panel).toHaveBeenCalledTimes(1)
    expect(panel.mock.calls[0][0]).toMatchObject({ new: { id: 's1', campaign_id: 'c1' } })
  })

  it('old forjado ("Concluído") semeado antes não apaga a transição da conclusão real', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener, { table: 'campaigns', event: 'UPDATE' })

    emit({ table: 'campaigns', eventType: 'INSERT', new: { id: 'x' }, old: null }) // abre a janela
    emit({
      table: 'campaigns',
      eventType: 'UPDATE',
      new: { id: 'c1', status: 'Enviando' },
      old: { id: 'c1', status: 'Concluído', completed_at: 'x' },
    })
    emit({
      table: 'campaigns',
      eventType: 'UPDATE',
      new: { id: 'c1', status: 'Concluído', completed_at: '2026-10-11T10:00:00Z' },
      old: { id: 'c1', status: 'Enviando', completed_at: null },
    })
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    const delivered = listener.mock.calls.map((call) => call[0])
    expect(delivered).toContainEqual(
      expect.objectContaining({
        new: { id: 'c1', status: 'Concluído', completed_at: '2026-10-11T10:00:00Z' },
        old: { id: 'c1', status: 'Enviando', completed_at: null },
      })
    )
  })

  it('apagar pasta com 21+ campanhas na janela não rebaixa a conclusão real a sinal genérico', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener, { table: 'campaigns' })

    // ON DELETE SET NULL de folder_id: um UPDATE por campanha (sem mudar status).
    // 1º sai na hora (leading), 20 enchem a cota de linhas e o resto estoura.
    for (let i = 0; i < 25; i++) {
      emit({
        table: 'campaigns',
        eventType: 'UPDATE',
        new: { id: `f_${i}`, status: 'Concluído', folder_id: null },
        old: { id: `f_${i}`, status: 'Concluído', completed_at: 'x' },
      })
    }
    const completion = {
      new: { id: 'c_real', status: 'Concluído', completed_at: '2026-10-11T10:00:00Z' },
      old: { id: 'c_real', status: 'Enviando', completed_at: null },
    }
    emit({ table: 'campaigns', eventType: 'UPDATE', ...completion })
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    const delivered = listener.mock.calls.map((call) => call[0])
    expect(delivered).toContainEqual(expect.objectContaining(completion))
    // o excesso sem transição continua virando UM sinal genérico
    expect(delivered.filter((e) => e.new === null && e.old === null)).toHaveLength(1)
  })

  it('flood de transições forjadas fica limitado pela cota própria (o excesso vira sinal genérico)', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener, { table: 'campaigns' })

    emit({ table: 'campaigns', eventType: 'INSERT', new: { id: 'x' }, old: null }) // abre a janela
    for (let i = 0; i < 500; i++) {
      emit({
        table: 'campaigns',
        eventType: 'UPDATE',
        new: { id: `fake_${i}`, status: 'Concluído' },
        old: { id: `fake_${i}`, status: 'Enviando' },
      })
    }
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    expect(listener).toHaveBeenCalledTimes(1 + DB_CHANGE_MAX_TRANSITIONS_PER_WINDOW + 1)
    expect(listener.mock.calls.at(-1)![0]).toMatchObject({ eventType: 'UPDATE', new: null, old: null })
  })

  it('linhas distintas na mesma janela não se perdem (filtros por conversa continuam valendo)', () => {
    const conv1 = vi.fn()
    const conv2 = vi.fn()
    subscribeToDbChanges(conv1, { table: 'inbox_messages', filter: 'conversation_id=eq.c1' })
    subscribeToDbChanges(conv2, { table: 'inbox_messages', filter: 'conversation_id=eq.c2' })

    emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: 'm0', conversation_id: 'c9' }, old: null })
    emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: 'm1', conversation_id: 'c1' }, old: null })
    emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: 'm2', conversation_id: 'c2' }, old: null })
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    expect(conv1).toHaveBeenCalledTimes(1)
    expect(conv2).toHaveBeenCalledTimes(1)
  })

  it('o sinal genérico do excesso chega também aos assinantes filtrados', () => {
    const filtered = vi.fn()
    subscribeToDbChanges(filtered, { table: 'inbox_messages', event: 'INSERT', filter: 'conversation_id=eq.c1' })

    emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: 'x0', conversation_id: 'zz' }, old: null })
    for (let i = 1; i <= DB_CHANGE_MAX_ROWS_PER_WINDOW + 5; i++) {
      emit({ table: 'inbox_messages', eventType: 'INSERT', new: { id: `x${i}`, conversation_id: 'zz' }, old: null })
    }
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    expect(filtered).toHaveBeenCalledTimes(1)
    expect(filtered.mock.calls[0][0]).toMatchObject({ table: 'inbox_messages', eventType: 'INSERT', new: null, old: null })
  })

  it('janela fecha quando a tabela fica quieta: o próximo evento volta a sair na hora', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener, { table: 'templates' })

    emit({ table: 'templates', eventType: 'UPDATE', new: { id: 't1' }, old: { id: 't1' } })
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS) // janela sem eventos: fecha
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    emit({ table: 'templates', eventType: 'UPDATE', new: { id: 't2' }, old: { id: 't2' } })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('tabelas diferentes têm janelas independentes', () => {
    const listener = vi.fn()
    subscribeToDbChanges(listener)

    emit({ table: 'flows', eventType: 'UPDATE', new: { id: 'f1' }, old: { id: 'f1' } })
    emit({ table: 'templates', eventType: 'UPDATE', new: { id: 't1' }, old: { id: 't1' } })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('subscribeToTable (compat com os hooks)', () => {
  it('mapeia o broadcast para RealtimePayload e respeita o filtro', () => {
    const channel = createRealtimeChannel('rq-test') as unknown as RealtimeChannel
    const callback = vi.fn()

    subscribeToTable(channel, 'inbox_messages', 'INSERT', callback, 'conversation_id=eq.conv1')

    emit({
      table: 'inbox_messages',
      eventType: 'INSERT',
      new: { id: 'm1', conversation_id: 'conv2', direction: 'inbound' },
      old: null,
    })
    emit({
      table: 'inbox_messages',
      eventType: 'INSERT',
      new: { id: 'm2', conversation_id: 'conv1', direction: 'inbound' },
      old: null,
      commit_timestamp: '2026-10-11T10:00:00Z',
    })
    vi.advanceTimersByTime(DB_CHANGE_WINDOW_MS)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({
      schema: 'public',
      table: 'inbox_messages',
      commit_timestamp: '2026-10-11T10:00:00Z',
      eventType: 'INSERT',
      new: { id: 'm2', conversation_id: 'conv1', direction: 'inbound' },
      old: null,
      errors: null,
    })

    // Não adiciona postgres_changes no canal do consumidor
    const own = channels.find((c) => c.topic === 'rq-test')!
    expect(own.otherBindings).toEqual([])
  })

  it('removeChannel cancela as assinaturas feitas com aquele canal', () => {
    const channelA = createRealtimeChannel('a') as unknown as RealtimeChannel
    const channelB = createRealtimeChannel('b') as unknown as RealtimeChannel
    const cbA = vi.fn()
    const cbB = vi.fn()

    subscribeToTable(channelA, 'campaigns', '*', cbA)
    subscribeToTable(channelA, 'campaigns', 'UPDATE', cbA)
    subscribeToTable(channelB, 'campaigns', '*', cbB)

    removeChannel(channelA)
    expect(fakeClient.removeChannel).toHaveBeenCalledWith(channelA)

    emit({ table: 'campaigns', eventType: 'UPDATE', new: { id: 'c' }, old: { id: 'c' } })
    expect(cbA).not.toHaveBeenCalled()
    expect(cbB).toHaveBeenCalledTimes(1)
  })
})
