// @vitest-environment node
/**
 * Contrato banco ↔ frontend do realtime (Broadcast from Database).
 *
 * Aplica TODAS as migrations num Postgres 17 real (PGlite, pelas funções exportadas de
 * scripts/check-migrations.mjs), gera eventos com escritas reais como service_role (igual
 * ao app) e passa cada payload de realtime.messages pelo caminho do frontend:
 * parseDbChangeMessage (mensagem do realtime-js), matchesRealtimeFilter com os MESMOS
 * filtros dos hooks/componentes (REALTIME_FILTERS, que eles importam), toRealtimePayload e a
 * detecção de transição de campanha (getCampaignFinalTransition / isDbChangeStatusTransition).
 *
 * Se a migration mudar a projeção (coluna renomeada, chave de filtro fora do payload,
 * old.status removido), este teste quebra antes do dashboard ficar mudo.
 * Uma instância só para o arquivo (as migrations levam ~1s); cada caso usa ids próprios.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ageCampaignWindow,
  BROADCAST_PAYLOAD_KEYS,
  createMigratedDb,
  describeTrigger,
  EXPECTED_BROADCAST_TRIGGERS,
  findPii,
  queryAs,
  readBroadcastTriggers,
  realtimeEventsSince,
  realtimeMaxSeq,
  takeBroadcastWarnings,
  validatePayloadShape,
  writeAs,
} from '@/scripts/check-migrations.mjs'
import {
  DB_BROADCAST_TABLES,
  DB_CHANGE_EVENT,
  DB_CHANGES_TOPIC,
  isDbChangeStatusTransition,
  matchesRealtimeFilter,
  parseDbChangeMessage,
  parseRealtimeFilter,
  REALTIME_FILTERS,
  type DbBroadcastTable,
  type DbChangeEvent,
} from '@/lib/realtime-db-change'
import { toRealtimePayload } from '@/lib/supabase-realtime'
import { getCampaignFinalTransition } from '@/hooks/useRealtimeNotifications'

interface HarnessDb {
  query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
  exec: (sql: string) => Promise<void>
  close: () => Promise<void>
}

interface RealtimeRow {
  seq: number
  topic: string
  event: string
  private: boolean
  payload: unknown
}

interface BroadcastTriggerRow {
  table: string
  name: string
  tgtype: number
  hasWhen: boolean
}

let db: HarnessDb

beforeAll(async () => {
  db = await createMigratedDb()
}, 120_000)

afterAll(async () => {
  await db?.close()
})

const write = (sql: string): Promise<void> => writeAs(db, 'service_role', sql)

/**
 * Roda as escritas e devolve os eventos publicados, convertidos como o app os recebe: a
 * mensagem do realtime-js ({ type: 'broadcast', event, payload }) → parseDbChangeMessage.
 */
async function capture(fn: () => Promise<unknown>): Promise<DbChangeEvent[]> {
  const since: number = await realtimeMaxSeq(db)
  await fn()
  expect(takeBroadcastWarnings(db), 'WARNING de broadcast numa escrita').toEqual([])
  const rows: RealtimeRow[] = await realtimeEventsSince(db, since)
  return rows.map((row) => {
    expect(row.topic).toBe(DB_CHANGES_TOPIC)
    expect(row.event).toBe(DB_CHANGE_EVENT)
    expect(row.private).toBe(false)
    // soft: a quebra do contrato aparece junto com o efeito dela nos filtros/transições abaixo
    expect.soft(validatePayloadShape(row.payload)).toEqual([])
    expect.soft(findPii(row.payload)).toEqual([])
    const event = parseDbChangeMessage({ type: 'broadcast', event: row.event, payload: row.payload })
    expect(event, JSON.stringify(row.payload)).not.toBeNull()
    expect(toRealtimePayload(event as DbChangeEvent).commit_timestamp).not.toBe('')
    return event as DbChangeEvent
  })
}

describe('contrato do realtime: banco (migrations) ↔ lib/realtime-db-change.ts', () => {
  it('as tabelas com trigger de broadcast são exatamente DB_BROADCAST_TABLES', async () => {
    const triggers: BroadcastTriggerRow[] = await readBroadcastTriggers(db)
    expect(triggers.map((t) => describeTrigger(t)).sort()).toEqual([...EXPECTED_BROADCAST_TRIGGERS].sort())
    expect([...new Set(triggers.map((t) => t.table))].sort()).toEqual([...DB_BROADCAST_TABLES].sort())
  })

  it('cada filtro de REALTIME_FILTERS usa uma coluna que sai em new E old do payload da tabela filtrada', () => {
    // Tabela de cada filtro (um filtro novo sem tabela aqui não compila)
    const tableOf: Record<keyof typeof REALTIME_FILTERS, DbBroadcastTable> = {
      campaignById: 'campaigns',
      conversationById: 'inbox_conversations',
      messagesByConversation: 'inbox_messages',
      projectItemsByProject: 'template_project_items',
      flowSubmissionsByCampaign: 'flow_submissions',
    }
    const payloadKeys = BROADCAST_PAYLOAD_KEYS as Record<DbBroadcastTable, { new: string[]; old: string[] }>
    for (const [name, build] of Object.entries(REALTIME_FILTERS)) {
      const table = tableOf[name as keyof typeof REALTIME_FILTERS]
      const column = parseRealtimeFilter(build('valor'))?.column
      // new: INSERT/UPDATE; old: DELETE (matchesRealtimeFilter compara com new e, sem ele, com old)
      expect(payloadKeys[table].new, `${name} → ${table}.new`).toContain(column)
      expect(payloadKeys[table].old, `${name} → ${table}.old`).toContain(column)
    }
  })

  it('campaigns: filtro do detalhe (useCampaignRealtime: REALTIME_FILTERS.campaignById) e transição final (useRealtimeNotifications)', async () => {
    const byId = REALTIME_FILTERS.campaignById
    const inserted = await capture(() =>
      write(`INSERT INTO public.campaigns (id, name, status) VALUES ('ct_c1', 'Campanha contrato', 'Rascunho'), ('ct_c2', 'Outra campanha', 'Rascunho')`))
    expect(inserted.map((e) => `${e.table}/${e.eventType}`)).toEqual(['campaigns/INSERT', 'campaigns/INSERT'])

    const [started] = await capture(() => write(`UPDATE public.campaigns SET status = 'Enviando', started_at = now() WHERE id = 'ct_c1'`))
    expect(matchesRealtimeFilter(started, byId('ct_c1'))).toBe(true)
    expect(matchesRealtimeFilter(started, byId('ct_c2'))).toBe(false)
    expect(isDbChangeStatusTransition(started)).toBe(true)
    expect(getCampaignFinalTransition(toRealtimePayload(started))).toBeNull()

    // Contador depois da janela do throttle: publica, mas não é transição
    await ageCampaignWindow(db, 'ct_c1')
    const [counter] = await capture(() => write(`SELECT public.increment_campaign_stat('ct_c1'::text, 'delivered'::text)`))
    expect(counter.new?.delivered).toBe(1)
    expect(matchesRealtimeFilter(counter, byId('ct_c1'))).toBe(true)
    expect(isDbChangeStatusTransition(counter)).toBe(false)
    expect(getCampaignFinalTransition(toRealtimePayload(counter))).toBeNull()

    const [completed] = await capture(() => write(`UPDATE public.campaigns SET status = 'Concluído', completed_at = now() WHERE id = 'ct_c1'`))
    expect(isDbChangeStatusTransition(completed)).toBe(true)
    expect(getCampaignFinalTransition(toRealtimePayload(completed))).toEqual({ id: 'ct_c1', status: 'Concluído' })

    // Webhook atrasado depois da conclusão: não é uma nova transição (senão viraria toast repetido)
    await ageCampaignWindow(db, 'ct_c1')
    const [late] = await capture(() => write(`SELECT public.increment_campaign_stat('ct_c1'::text, 'read'::text)`))
    expect(late.new?.status).toBe('Concluído')
    expect(isDbChangeStatusTransition(late)).toBe(false)
    expect(getCampaignFinalTransition(toRealtimePayload(late))).toBeNull()

    const [failed] = await capture(() => write(`UPDATE public.campaigns SET status = 'Falhou' WHERE id = 'ct_c2'`))
    expect(getCampaignFinalTransition(toRealtimePayload(failed))).toEqual({ id: 'ct_c2', status: 'Falhou' })

    const [deleted] = await capture(() => write(`DELETE FROM public.campaigns WHERE id = 'ct_c2'`))
    expect(deleted).toMatchObject({ table: 'campaigns', eventType: 'DELETE', new: null })
    expect(matchesRealtimeFilter(deleted, byId('ct_c2'))).toBe(true)
  })

  it('inbox: filtros do useConversation (REALTIME_FILTERS.messagesByConversation nas mensagens, conversationById na conversa)', async () => {
    const phone = '+5511900000201'
    const inbound = (wamid: string) =>
      queryAs(db, 'service_role', `SELECT public.process_inbound_message($1, $2, $3)`, [phone, 'mensagem secreta do cliente', wamid])

    // 1ª mensagem: a conversa nova não publica; o INSERT da mensagem traz conversation_id
    const [first] = await capture(() => inbound('wamid.contract.1'))
    expect(first).toMatchObject({ table: 'inbox_messages', eventType: 'INSERT' })
    const conversationId = String(first.new?.conversation_id)
    const messageFilter = REALTIME_FILTERS.messagesByConversation(conversationId)
    expect(matchesRealtimeFilter(first, messageFilter)).toBe(true)
    expect(matchesRealtimeFilter(first, REALTIME_FILTERS.messagesByConversation('00000000-0000-0000-0000-000000000000'))).toBe(false)

    // 2ª mensagem: UPDATE da conversa (não lidas) + INSERT da mensagem
    const second = await capture(() => inbound('wamid.contract.2'))
    const conversation = second.find((e) => e.table === 'inbox_conversations')
    const message = second.find((e) => e.table === 'inbox_messages')
    expect(conversation?.eventType).toBe('UPDATE')
    expect(matchesRealtimeFilter(conversation as DbChangeEvent, REALTIME_FILTERS.conversationById(conversationId))).toBe(true)
    expect(matchesRealtimeFilter(message as DbChangeEvent, messageFilter)).toBe(true)

    // Status de entrega de uma resposta (fora de campanha) chega pelo filtro de UPDATE
    await capture(() =>
      write(`INSERT INTO public.inbox_messages (conversation_id, direction, content, whatsapp_message_id, delivery_status)
             VALUES ('${conversationId}', 'outbound', 'resposta', 'wamid.contract.out', 'sent')`))
    const [status] = await capture(() =>
      write(`UPDATE public.inbox_messages SET delivery_status = 'read', read_at = now() WHERE whatsapp_message_id = 'wamid.contract.out'`))
    expect(status.eventType).toBe('UPDATE')
    expect(matchesRealtimeFilter(status, messageFilter)).toBe(true)

    // DELETE de mensagens é por statement: sinal sem linha, que só o assinante sem filtro
    // (CentralizedRealtimeProvider, que invalida pela tabela) recebe
    const [removed] = await capture(() => write(`DELETE FROM public.inbox_messages WHERE whatsapp_message_id = 'wamid.contract.out'`))
    expect(removed).toMatchObject({ table: 'inbox_messages', eventType: 'DELETE', new: null, old: null })
    expect(matchesRealtimeFilter(removed, undefined)).toBe(true)
    expect(matchesRealtimeFilter(removed, messageFilter)).toBe(false)
  })

  it('template_project_items: filtro do detalhe do projeto (REALTIME_FILTERS.projectItemsByProject) vale para INSERT, UPDATE e DELETE', async () => {
    await write(`INSERT INTO public.template_projects (id, title) VALUES ('ct_tp1', 'Projeto'), ('ct_tp2', 'Outro projeto')`)
    const events = await capture(async () => {
      await write(`INSERT INTO public.template_project_items (id, project_id, name, content) VALUES ('ct_i1', 'ct_tp1', 'item', 'Olá {{1}}')`)
      await write(`UPDATE public.template_project_items SET meta_status = 'APPROVED' WHERE id = 'ct_i1'`)
      await write(`DELETE FROM public.template_project_items WHERE id = 'ct_i1'`)
    })
    expect(events.map((e) => e.eventType)).toEqual(['INSERT', 'UPDATE', 'DELETE'])
    for (const event of events) {
      expect(matchesRealtimeFilter(event, REALTIME_FILTERS.projectItemsByProject('ct_tp1'))).toBe(true)
      expect(matchesRealtimeFilter(event, REALTIME_FILTERS.projectItemsByProject('ct_tp2'))).toBe(false)
    }
  })

  it('flow_submissions: filtro do CampaignFlowPanel (REALTIME_FILTERS.flowSubmissionsByCampaign)', async () => {
    await write(`INSERT INTO public.campaigns (id, name) VALUES ('ct_c3', 'Campanha com flow')`)
    const [submission] = await capture(() =>
      write(`INSERT INTO public.flow_submissions (id, message_id, from_phone, response_json_raw, campaign_id)
             VALUES ('ct_fs1', 'wamid.contract.fs', '+5511900000202', '{}', 'ct_c3')`))
    expect(submission).toMatchObject({ table: 'flow_submissions', eventType: 'INSERT' })
    expect(matchesRealtimeFilter(submission, REALTIME_FILTERS.flowSubmissionsByCampaign('ct_c3'))).toBe(true)
    expect(matchesRealtimeFilter(submission, REALTIME_FILTERS.flowSubmissionsByCampaign('ct_c1'))).toBe(false)
  })

  it('listas sem filtro (templates, flows, account_alerts, template_projects, contacts): todo evento chega ao assinante', async () => {
    const events = await capture(async () => {
      await write(`INSERT INTO public.templates (name, language, status) VALUES ('ct_tpl', 'pt_BR', 'APPROVED')`)
      await write(`UPDATE public.templates SET status = 'REJECTED' WHERE name = 'ct_tpl'`)
      await write(`INSERT INTO public.flows (id, name) VALUES ('ct_fl', 'Flow do contrato')`)
      await write(`INSERT INTO public.account_alerts (type, message) VALUES ('payment', 'alerta do contrato')`)
      await write(`UPDATE public.template_projects SET status = 'submitted' WHERE id = 'ct_tp2'`)
      await write(`INSERT INTO public.contacts (phone, name) VALUES ('+5511900000203', 'Maria Teste')`)
    })
    expect(events.map((e) => `${e.table}/${e.eventType}`)).toEqual([
      'templates/INSERT',
      'templates/UPDATE',
      'flows/INSERT',
      'account_alerts/INSERT',
      'template_projects/UPDATE',
      'contacts/INSERT',
    ])
    for (const event of events) expect(matchesRealtimeFilter(event, undefined)).toBe(true)
    expect(events.find((e) => e.table === 'contacts')).toMatchObject({ new: null, old: null })
  })
})
