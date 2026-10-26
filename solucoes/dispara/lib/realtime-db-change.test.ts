import { describe, expect, it } from 'vitest'
import {
  DB_CHANGE_EVENT,
  dbChangeContentKey,
  isDbChangeStatusTransition,
  matchesRealtimeFilter,
  parseDbChangeMessage,
  parseRealtimeFilter,
  toRealtimeEvent,
  type DbChangeEvent,
} from '@/lib/realtime-db-change'

const basePayload = {
  table: 'inbox_messages',
  eventType: 'INSERT',
  new: { id: 'm1', conversation_id: 'c1', direction: 'inbound' },
  old: null,
  commit_timestamp: '2026-10-11T10:00:00.000Z',
}

describe('parseDbChangeMessage', () => {
  it('aceita a mensagem de broadcast completa do realtime-js', () => {
    const event = parseDbChangeMessage({ type: 'broadcast', event: DB_CHANGE_EVENT, payload: basePayload })
    expect(event).toEqual({
      table: 'inbox_messages',
      eventType: 'INSERT',
      new: { id: 'm1', conversation_id: 'c1', direction: 'inbound' },
      old: null,
      commit_timestamp: '2026-10-11T10:00:00.000Z',
    })
  })

  it('aceita o payload cru', () => {
    expect(parseDbChangeMessage(basePayload)?.table).toBe('inbox_messages')
  })

  it('aceita evento por statement (new/old nulos)', () => {
    const event = parseDbChangeMessage({
      event: DB_CHANGE_EVENT,
      payload: { table: 'contacts', eventType: 'INSERT', new: null, old: null },
    })
    expect(event).toEqual({ table: 'contacts', eventType: 'INSERT', new: null, old: null, commit_timestamp: null })
  })

  it('ignora outro evento de broadcast', () => {
    expect(parseDbChangeMessage({ event: 'campaign_progress', payload: basePayload })).toBeNull()
  })

  it('ignora tabela fora do contrato (canal público: input não confiável)', () => {
    expect(parseDbChangeMessage({ ...basePayload, table: 'attendant_tokens' })).toBeNull()
    expect(parseDbChangeMessage({ ...basePayload, table: 'campaign_contacts' })).toBeNull()
  })

  it('ignora eventType inválido', () => {
    expect(parseDbChangeMessage({ ...basePayload, eventType: '*' })).toBeNull()
    expect(parseDbChangeMessage({ ...basePayload, eventType: 'TRUNCATE' })).toBeNull()
  })

  it('ignora new/old que não são objeto', () => {
    expect(parseDbChangeMessage({ ...basePayload, new: 'x' })).toBeNull()
    expect(parseDbChangeMessage({ ...basePayload, old: ['a'] })).toBeNull()
  })

  it('ignora lixo', () => {
    expect(parseDbChangeMessage(null)).toBeNull()
    expect(parseDbChangeMessage('db_change')).toBeNull()
    expect(parseDbChangeMessage([basePayload])).toBeNull()
  })
})

describe('parseRealtimeFilter / matchesRealtimeFilter', () => {
  const update: DbChangeEvent = {
    table: 'campaigns',
    eventType: 'UPDATE',
    new: { id: 'c_1', status: 'Enviando', sent: 10 },
    old: { id: 'c_1', status: 'Agendado', sent: 0 },
    commit_timestamp: null,
  }

  it('interpreta coluna=eq.valor', () => {
    expect(parseRealtimeFilter('campaign_id=eq.c_123')).toEqual({ column: 'campaign_id', value: 'c_123' })
    expect(parseRealtimeFilter('id=eq.8f2c-uuid')).toEqual({ column: 'id', value: '8f2c-uuid' })
    expect(parseRealtimeFilter(undefined)).toBeNull()
    expect(parseRealtimeFilter('id=in.(1,2)')).toBeNull()
  })

  it('sem filtro casa tudo', () => {
    expect(matchesRealtimeFilter(update, undefined)).toBe(true)
    expect(matchesRealtimeFilter(update, '')).toBe(true)
  })

  it('casa pela linha nova', () => {
    expect(matchesRealtimeFilter(update, 'id=eq.c_1')).toBe(true)
    expect(matchesRealtimeFilter(update, 'id=eq.c_2')).toBe(false)
    expect(matchesRealtimeFilter(update, 'sent=eq.10')).toBe(true)
  })

  it('em DELETE casa pela linha antiga', () => {
    const del: DbChangeEvent = {
      table: 'template_project_items',
      eventType: 'DELETE',
      new: null,
      old: { id: 'tpi_1', project_id: 'tp_9' },
      commit_timestamp: null,
    }
    expect(matchesRealtimeFilter(del, 'project_id=eq.tp_9')).toBe(true)
    expect(matchesRealtimeFilter(del, 'project_id=eq.tp_1')).toBe(false)
  })

  it('coluna ausente (não whitelisted) ou filtro não suportado não casam', () => {
    expect(matchesRealtimeFilter(update, 'phone=eq.5511999999999')).toBe(false)
    expect(matchesRealtimeFilter(update, 'id=neq.c_1')).toBe(false)
  })

  it('evento por statement não casa filtro de linha', () => {
    const stmt: DbChangeEvent = { table: 'contacts', eventType: 'UPDATE', new: null, old: null, commit_timestamp: null }
    expect(matchesRealtimeFilter(stmt, 'id=eq.ct_1')).toBe(false)
    expect(matchesRealtimeFilter(stmt, undefined)).toBe(true)
  })
})

describe('toRealtimeEvent', () => {
  it('mapeia para {table, eventType, new, old}', () => {
    const event = parseDbChangeMessage({
      event: DB_CHANGE_EVENT,
      payload: {
        table: 'inbox_conversations',
        eventType: 'UPDATE',
        new: { id: 'conv1', unread_count: 2 },
        old: { id: 'conv1', unread_count: 1 },
        commit_timestamp: '2026-10-11T10:00:00Z',
      },
    })!
    expect(toRealtimeEvent(event)).toEqual({
      table: 'inbox_conversations',
      eventType: 'UPDATE',
      new: { id: 'conv1', unread_count: 2 },
      old: { id: 'conv1', unread_count: 1 },
    })
  })
})

describe('dbChangeContentKey (coalescência só de eventos idênticos)', () => {
  const event = (overrides: Partial<DbChangeEvent>): DbChangeEvent => ({
    table: 'flow_submissions',
    eventType: 'INSERT',
    new: { id: 's1', campaign_id: 'c1' },
    old: null,
    commit_timestamp: null,
    ...overrides,
  })

  it('mesmo conteúdo (em qualquer ordem de chaves) dá a mesma chave', () => {
    expect(dbChangeContentKey(event({ new: { id: 's1', campaign_id: 'c1' } }))).toBe(
      dbChangeContentKey(event({ new: { campaign_id: 'c1', id: 's1' } }))
    )
  })

  it('mesma linha com outro valor de filtro ou outro old é outra chave', () => {
    const legit = dbChangeContentKey(event({}))
    expect(dbChangeContentKey(event({ new: { id: 's1', campaign_id: 'zzz' } }))).not.toBe(legit)
    const update = event({ table: 'campaigns', eventType: 'UPDATE', new: { id: 'c1', status: 'Concluído' } })
    expect(dbChangeContentKey({ ...update, old: { id: 'c1', status: 'Enviando' } })).not.toBe(
      dbChangeContentKey({ ...update, old: { id: 'c1', status: 'Concluído' } })
    )
  })

  it('não serializa objeto aninhado (input não confiável, sem recursão)', () => {
    let deep: Record<string, unknown> = {}
    for (let i = 0; i < 100_000; i++) deep = { nested: deep }
    expect(() => dbChangeContentKey(event({ new: { id: 's1', campaign_id: deep } }))).not.toThrow()
  })
})

describe('isDbChangeStatusTransition', () => {
  const update = (next: Record<string, unknown>, prev: Record<string, unknown> | null): DbChangeEvent => ({
    table: 'campaigns',
    eventType: 'UPDATE',
    new: next,
    old: prev,
    commit_timestamp: null,
  })

  it('detecta mudança de status e completed_at preenchido', () => {
    expect(isDbChangeStatusTransition(update({ id: 'c1', status: 'Concluído' }, { id: 'c1', status: 'Enviando' }))).toBe(
      true
    )
    expect(
      isDbChangeStatusTransition(
        update({ id: 'c1', status: 'Concluído', completed_at: 'x' }, { id: 'c1', status: 'Concluído', completed_at: null })
      )
    ).toBe(true)
  })

  it('contador, pasta e tabelas sem status no old não são transição', () => {
    expect(
      isDbChangeStatusTransition(update({ id: 'c1', status: 'Enviando', sent: 2 }, { id: 'c1', status: 'Enviando' }))
    ).toBe(false)
    expect(isDbChangeStatusTransition(update({ id: 'c1', status: 'Concluído' }, null))).toBe(false)
    expect(
      isDbChangeStatusTransition({ ...update({ id: 'm1', delivery_status: 'read' }, { id: 'm1' }), table: 'inbox_messages' })
    ).toBe(false)
    expect(isDbChangeStatusTransition({ ...update({ id: 'c1', status: 'Concluído' }, null), eventType: 'INSERT' })).toBe(
      false
    )
  })
})
