/**
 * Realtime "Broadcast from Database" — contrato do payload e helpers puros.
 *
 * O banco publica mudanças no canal PÚBLICO `dispara-db` (evento `db_change`) pela
 * trigger `public.dispara_broadcast_change()` (migration 20261011000000_security_hardening.sql).
 * O payload traz SÓ colunas whitelisted (ids, status, contadores, timestamps) — nunca PII.
 *
 * Importante: qualquer pessoa com a chave publishable consegue ouvir E emitir mensagens
 * nesse canal. Trate o evento como um SINAL ("algo mudou em X") e busque os dados reais
 * pelas APIs autenticadas:
 * - NUNCA escreva valores do payload no cache ou no estado (setQueryData/setState com
 *   contador, status de entrega etc.) — invalide a query (lib/realtime-invalidation.ts);
 * - use os campos só para decidir SE invalidar (filtro, tabela, transição a confirmar
 *   pela API), nunca para renderizar;
 * - conte com rajadas (legítimas ou forjadas): o hub em lib/supabase-realtime.ts
 *   coalesce por tabela e o invalidador limita a taxa de refetch.
 */

export const DB_CHANGES_TOPIC = 'dispara-db'
export const DB_CHANGE_EVENT = 'db_change'

/** Tabelas com trigger de broadcast (mesma lista da migration). */
export const DB_BROADCAST_TABLES = [
  'campaigns',
  'contacts',
  'templates',
  'flows',
  'inbox_conversations',
  'inbox_messages',
  'account_alerts',
  'template_projects',
  'template_project_items',
  'flow_submissions',
] as const

export type DbBroadcastTable = (typeof DB_BROADCAST_TABLES)[number]

export type DbChangeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

const DB_CHANGE_EVENT_TYPES: readonly DbChangeEventType[] = ['INSERT', 'UPDATE', 'DELETE'] as const

export interface DbChangeEvent {
  table: DbBroadcastTable
  eventType: DbChangeEventType
  /** Colunas whitelisted da linha nova (INSERT/UPDATE); null em DELETE e em triggers por statement. */
  new: Record<string, unknown> | null
  /**
   * Só as chaves da linha antiga (UPDATE/DELETE): id + coluna de filtro/transição
   * (ex.: conversation_id, project_id; status/completed_at em campaigns).
   * null em INSERT e em triggers por statement.
   */
  old: Record<string, unknown> | null
  commit_timestamp: string | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDbBroadcastTable(value: unknown): value is DbBroadcastTable {
  return typeof value === 'string' && (DB_BROADCAST_TABLES as readonly string[]).includes(value)
}

function isDbChangeEventType(value: unknown): value is DbChangeEventType {
  return typeof value === 'string' && (DB_CHANGE_EVENT_TYPES as readonly string[]).includes(value)
}

/**
 * Converte a mensagem de broadcast recebida do realtime-js em DbChangeEvent.
 *
 * Aceita tanto a mensagem completa (`{ type: 'broadcast', event, payload }`) quanto o
 * payload cru. Retorna null para qualquer coisa fora do contrato (tabela desconhecida,
 * eventType inválido, new/old que não são objeto) — o canal é público, então o input
 * não é confiável.
 */
export function parseDbChangeMessage(message: unknown): DbChangeEvent | null {
  if (!isPlainObject(message)) return null

  if ('event' in message && message.event !== undefined && message.event !== DB_CHANGE_EVENT) {
    return null
  }

  const payload = isPlainObject(message.payload) ? message.payload : message

  const table = payload.table
  const eventType = payload.eventType
  if (!isDbBroadcastTable(table) || !isDbChangeEventType(eventType)) return null

  const rawNew = payload.new
  const rawOld = payload.old
  if (rawNew != null && !isPlainObject(rawNew)) return null
  if (rawOld != null && !isPlainObject(rawOld)) return null

  const commitTimestamp = payload.commit_timestamp

  return {
    table,
    eventType,
    new: rawNew ?? null,
    old: rawOld ?? null,
    commit_timestamp: typeof commitTimestamp === 'string' ? commitTimestamp : null,
  }
}

export interface RealtimeRowFilter {
  column: string
  value: string
}

/**
 * Interpreta o subconjunto de filtro PostgREST que o app usa: `coluna=eq.valor`.
 * Retorna null para filtros vazios ou fora desse formato.
 */
export function parseRealtimeFilter(filter: string | undefined | null): RealtimeRowFilter | null {
  if (!filter) return null
  const match = /^([a-zA-Z_][a-zA-Z0-9_]*)=eq\.(.+)$/.exec(filter.trim())
  if (!match) return null
  return { column: match[1], value: match[2] }
}

/**
 * Filtros `coluna=eq.valor` que os hooks/componentes passam ao hub de realtime. Ficam aqui
 * (e não como literais espalhados) para o teste de contrato com o banco
 * (lib/realtime-db-change.contract.test.ts) usar EXATAMENTE os mesmos: a coluna de cada um
 * precisa estar na projeção de dispara_broadcast_change (migration de hardening).
 */
export const REALTIME_FILTERS = {
  /** useCampaignRealtime: UPDATE da campanha aberta no detalhe (campaigns) */
  campaignById: (campaignId: string): string => `id=eq.${campaignId}`,
  /** useConversation: UPDATE da conversa aberta (inbox_conversations) */
  conversationById: (conversationId: string): string => `id=eq.${conversationId}`,
  /** useMessages: INSERT/UPDATE das mensagens da conversa (inbox_messages) */
  messagesByConversation: (conversationId: string): string => `conversation_id=eq.${conversationId}`,
  /** useTemplateProjectDetailsQuery: itens do projeto aberto (template_project_items) */
  projectItemsByProject: (projectId: string): string => `project_id=eq.${projectId}`,
  /** CampaignFlowPanel: submissões do Flow da campanha (flow_submissions) */
  flowSubmissionsByCampaign: (campaignId: string): string => `campaign_id=eq.${campaignId}`,
} as const

/**
 * Aplica no cliente o filtro que o postgres_changes aplicava no servidor.
 * Compara contra a linha nova e, se não houver (DELETE), contra a antiga.
 * Filtro em formato não suportado → não casa (fail-closed, evita invalidar errado).
 */
export function matchesRealtimeFilter(event: DbChangeEvent, filter: string | undefined | null): boolean {
  if (!filter) return true
  const parsed = parseRealtimeFilter(filter)
  if (!parsed) return false

  const rows = [event.new, event.old].filter((row): row is Record<string, unknown> => row !== null)
  return rows.some((row) => {
    const value = row[parsed.column]
    return value !== undefined && value !== null && String(value) === parsed.value
  })
}

function rowContentKey(row: Record<string, unknown> | null): string {
  if (!row) return '-'
  return Object.keys(row)
    .sort()
    .map((column) => {
      const value = row[column]
      const scalar =
        value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      // As colunas do contrato são escalares; objeto/array (só em payload forjado) entra
      // pelo tipo, sem serializar (nada de recursão em input não confiável).
      return `${JSON.stringify(column)}:${scalar ? JSON.stringify(value) : `<${Array.isArray(value) ? 'array' : typeof value}>`}`
    })
    .join(',')
}

/**
 * Chave de coalescência: tipo + linha + conteúdo de new/old. Só eventos com o MESMO
 * conteúdo colapsam — um evento forjado com o id de uma linha real (mas outro
 * campaign_id/conversation_id, ou outro `old.status`) é outra entrada e nunca é
 * misturado ao legítimo.
 */
export function dbChangeContentKey(event: DbChangeEvent): string {
  const row = event.new ?? event.old
  const id = row?.id
  const rowId = typeof id === 'string' || typeof id === 'number' ? String(id) : '*'
  return `${event.eventType}|${rowId}|${rowContentKey(event.new)}|${rowContentKey(event.old)}`
}

/**
 * O evento carrega uma transição de status (ex.: campanha Enviando → Concluído)?
 * Só UPDATE cujo `old` traz a coluna (hoje, campaigns: old = id/status/completed_at).
 */
export function isDbChangeStatusTransition(event: DbChangeEvent): boolean {
  if (event.eventType !== 'UPDATE' || !event.new || !event.old) return false
  const statusChanged = 'status' in event.old && event.new.status !== event.old.status
  const completed = 'completed_at' in event.old && event.old.completed_at == null && event.new.completed_at != null
  return statusChanged || completed
}

/** Evento no formato que o CentralizedRealtimeProvider entrega aos assinantes. */
export interface RealtimeEvent {
  table: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  new: Record<string, unknown> | null
  old: Record<string, unknown> | null
}

export function toRealtimeEvent(event: DbChangeEvent): RealtimeEvent {
  return {
    table: event.table,
    eventType: event.eventType,
    new: event.new,
    old: event.old,
  }
}
