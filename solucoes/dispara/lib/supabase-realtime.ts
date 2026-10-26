/**
 * Supabase Realtime Utilities
 *
 * Provides utilities for subscribing to database changes via Supabase Realtime.
 * Follows constitution: API-first, Type Safety, Simplicity.
 *
 * Mudanças de tabela chegam por "Broadcast from Database": a trigger
 * public.dispara_broadcast_change() publica no canal público `dispara-db`
 * (evento `db_change`) só colunas não sensíveis. O antigo postgres_changes
 * dependia de policies `TO anon USING (true)` que expunham a base inteira
 * (removidas na migration 20261011000000_security_hardening.sql).
 *
 * Um ÚNICO canal `dispara-db` é compartilhado por todos os assinantes (hub em
 * memória) e nunca é removido: realtime-js reaproveita canais pelo nome, e
 * remover/recriar um canal de nome fixo com removeChannel assíncrono matava o
 * realtime de quem chegava depois.
 */

import { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowser } from './supabase'
import {
    DB_CHANGES_TOPIC,
    DB_CHANGE_EVENT,
    dbChangeContentKey,
    isDbChangeStatusTransition,
    matchesRealtimeFilter,
    parseDbChangeMessage,
    type DbChangeEvent,
} from '@/lib/realtime-db-change'
import type { RealtimeTable, RealtimeEventType, RealtimePayload, ChannelStatus } from '@/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const REALTIME_CONFIG = {
    /** Max retries before giving up */
    maxRetries: 3,
    /** Base delay for exponential backoff (ms) */
    baseDelayMs: 1000,
    /** Timeout for connection (ms) */
    timeoutMs: 10000,
    /** Whether to log debug info */
    debug: process.env.NODE_ENV === 'development',
}

// Track connection state globally to avoid spamming logs
let connectionFailureLogged = false
let lastConnectionAttempt = 0

// ============================================================================
// DB CHANGES HUB (canal compartilhado `dispara-db`)
// ============================================================================

export type DbChangeListener = (event: DbChangeEvent) => void

export interface DbChangeSubscriptionOptions {
    /** Só eventos desta tabela (default: todas) */
    table?: string
    /** Só este tipo de evento (default: '*') */
    event?: RealtimeEventType
    /** Filtro `coluna=eq.valor`, aplicado no cliente sobre as colunas whitelisted */
    filter?: string
}

interface DbChangeListenerEntry {
    listener: DbChangeListener
    table?: string
    event: RealtimeEventType
    filter?: string
}

const dbChangeListeners = new Set<DbChangeListenerEntry>()
const dbChangeStatusListeners = new Set<(status: ChannelStatus) => void>()
let dbChangesChannel: RealtimeChannel | null = null
let dbChangesStatus: ChannelStatus | null = null

/**
 * Coalescência por tabela. O canal `dispara-db` é público (qualquer um emite nele) e
 * eventos legítimos também chegam em rajada (sync de templates, status de entrega):
 * - o 1º evento de uma tabela fora de janela é entregue na hora (leading) e abre uma
 *   janela de DB_CHANGE_WINDOW_MS;
 * - dentro da janela só eventos IDÊNTICOS colapsam (mesmo tipo, mesma linha e mesmo
 *   conteúdo de new/old — dbChangeContentKey). Payloads diferentes da mesma linha são
 *   entradas separadas, cada uma entregue intacta: nada de fundir o `new` de um com o
 *   `old` de outro, senão um evento forjado com o id de uma linha real trocaria o
 *   campaign_id/conversation_id (o assinante filtrado não seria chamado) ou o
 *   `old.status` (a transição de conclusão sumiria) do evento legítimo;
 * - no fim da janela o grupo é entregue (trailing) e, se houve evento, abre outra:
 *   sob flood, no máximo 1 entrega por tabela por janela, e nunca adiada para sempre;
 * - acima de DB_CHANGE_MAX_ROWS_PER_WINDOW entradas distintas, o excesso vira UM sinal
 *   genérico por tipo de evento (new/old nulos), entregue a todos os assinantes da
 *   tabela (inclusive os filtrados), que só invalidam e buscam pela API;
 * - eventos com transição de status (isDbChangeStatusTransition: campanha que conclui
 *   ou falha) têm cota própria (DB_CHANGE_MAX_TRANSITIONS_PER_WINDOW): uma rajada
 *   legítima sem transição (ex.: apagar uma pasta com 21+ campanhas faz um UPDATE de
 *   folder_id por linha) não rebaixa a conclusão de uma campanha a sinal genérico.
 *   Mesmo quando a cota estoura (flood forjado), useRealtimeNotifications trata o
 *   sinal genérico conferindo pela API as campanhas em andamento que ela conhece.
 */
export const DB_CHANGE_WINDOW_MS = 1000
export const DB_CHANGE_MAX_ROWS_PER_WINDOW = 20
export const DB_CHANGE_MAX_TRANSITIONS_PER_WINDOW = 20

interface DbChangeWindow {
    timer: ReturnType<typeof setTimeout>
    /** Eventos distintos (dbChangeContentKey), na ordem de chegada */
    rows: Map<string, DbChangeEvent>
    /** Quantas entradas de `rows` são transição de status (cota própria) */
    transitions: number
    /** Sinal genérico por tipo de evento, quando estoura o limite de linhas */
    overflow: Map<DbChangeEvent['eventType'], DbChangeEvent>
}

const dbChangeWindows = new Map<string, DbChangeWindow>()

/** Entrega um evento aos listeners que casam tabela/evento (e filtro, se não for sinal genérico). */
function deliverDbChange(event: DbChangeEvent, ignoreFilter = false): void {
    dbChangeListeners.forEach((entry) => {
        if (entry.table && entry.table !== event.table) return
        if (entry.event !== '*' && entry.event !== event.eventType) return
        if (!ignoreFilter && !matchesRealtimeFilter(event, entry.filter)) return
        try {
            entry.listener(event)
        } catch (err) {
            console.error(`[Realtime] Listener error for ${event.table}:`, err)
        }
    })
}

function openDbChangeWindow(table: string): void {
    dbChangeWindows.set(table, {
        timer: setTimeout(() => flushDbChangeWindow(table), DB_CHANGE_WINDOW_MS),
        rows: new Map(),
        transitions: 0,
        overflow: new Map(),
    })
}

function flushDbChangeWindow(table: string): void {
    const batch = dbChangeWindows.get(table)
    dbChangeWindows.delete(table)
    if (!batch || (batch.rows.size === 0 && batch.overflow.size === 0)) return

    // Houve eventos na janela: a próxima já começa (cadência fixa sob rajada).
    openDbChangeWindow(table)
    batch.rows.forEach((event) => deliverDbChange(event))
    batch.overflow.forEach((event) => deliverDbChange(event, true))
}

/**
 * Entrega um evento já validado aos listeners que casam tabela/evento/filtro,
 * com coalescência por tabela (ver DB_CHANGE_WINDOW_MS).
 */
export function dispatchDbChange(event: DbChangeEvent): void {
    const batch = dbChangeWindows.get(event.table)
    if (!batch) {
        openDbChangeWindow(event.table)
        deliverDbChange(event)
        return
    }

    const key = dbChangeContentKey(event)
    // Duplicata exata (o flood barato): já está no lote
    if (batch.rows.has(key)) return

    if (isDbChangeStatusTransition(event)) {
        if (batch.transitions < DB_CHANGE_MAX_TRANSITIONS_PER_WINDOW) {
            batch.rows.set(key, event)
            batch.transitions += 1
            return
        }
    } else if (batch.rows.size - batch.transitions < DB_CHANGE_MAX_ROWS_PER_WINDOW) {
        batch.rows.set(key, event)
        return
    }
    batch.overflow.set(event.eventType, {
        table: event.table,
        eventType: event.eventType,
        new: null,
        old: null,
        commit_timestamp: event.commit_timestamp,
    })
}

function handleDbChangeMessage(message: unknown): void {
    const event = parseDbChangeMessage(message)
    if (!event) return
    dispatchDbChange(event)
}

function ensureDbChangesChannel(): RealtimeChannel | null {
    if (dbChangesChannel) return dbChangesChannel

    // Sem Supabase configurado (wizard de setup / env ausente): silencioso, como antes no provider
    const supabase = getSupabaseBrowser()
    if (!supabase) return null

    const channel = supabase.channel(DB_CHANGES_TOPIC, { config: { private: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel.on('broadcast' as any, { event: DB_CHANGE_EVENT } as any, (message: unknown) => {
        handleDbChangeMessage(message)
    })
    channel.subscribe((status) => {
        dbChangesStatus = status as ChannelStatus
        if (status === 'SUBSCRIBED') connectionFailureLogged = false
        dbChangeStatusListeners.forEach((cb) => {
            try {
                cb(status as ChannelStatus)
            } catch {
                // ignore
            }
        })
    })

    dbChangesChannel = channel
    return channel
}

/**
 * Assina mudanças de tabela vindas do canal compartilhado `dispara-db`.
 * O payload traz só colunas whitelisted (ver migration); para o resto, refaça o
 * fetch pela API autenticada.
 *
 * @returns Função para cancelar a assinatura (o canal compartilhado continua aberto)
 */
export function subscribeToDbChanges(
    listener: DbChangeListener,
    options: DbChangeSubscriptionOptions = {}
): () => void {
    if (!ensureDbChangesChannel()) return () => { }

    const entry: DbChangeListenerEntry = {
        listener,
        table: options.table,
        event: options.event ?? '*',
        filter: options.filter,
    }
    dbChangeListeners.add(entry)
    return () => {
        dbChangeListeners.delete(entry)
    }
}

/**
 * Acompanha o status do canal compartilhado (SUBSCRIBED, CHANNEL_ERROR...).
 * Chama o callback imediatamente com o status atual, se já houver.
 */
export function onDbChangesStatus(callback: (status: ChannelStatus) => void): () => void {
    dbChangeStatusListeners.add(callback)
    if (dbChangesStatus) callback(dbChangesStatus)
    return () => {
        dbChangeStatusListeners.delete(callback)
    }
}

/** Converte o evento do broadcast no RealtimePayload que os hooks já consomem. */
export function toRealtimePayload<T extends Record<string, unknown> = Record<string, unknown>>(
    event: DbChangeEvent
): RealtimePayload<T> {
    return {
        schema: 'public',
        table: event.table as RealtimeTable,
        commit_timestamp: event.commit_timestamp ?? '',
        eventType: event.eventType,
        new: event.new as T | null,
        old: event.old as T | null,
        errors: null,
    }
}

/** @internal Só para testes: zera o hub (listeners, status, janelas de coalescência e canal). */
export function __resetDbChangesHubForTests(): void {
    dbChangeListeners.clear()
    dbChangeStatusListeners.clear()
    dbChangeWindows.forEach((batch) => clearTimeout(batch.timer))
    dbChangeWindows.clear()
    dbChangesChannel = null
    dbChangesStatus = null
}

// ============================================================================
// CHANNEL MANAGER
// ============================================================================

// Assinaturas do hub feitas via subscribeToTable, amarradas ao canal do consumidor
// para que removeChannel(channel) as cancele.
const channelDbSubscriptions = new WeakMap<RealtimeChannel, Array<() => void>>()

/**
 * Creates a Realtime channel for subscribing to database changes
 * 
 * @param channelName - Unique name for this channel
 * @returns RealtimeChannel instance
 */
export function createRealtimeChannel(channelName: string): RealtimeChannel | null {
    const supabase = getSupabaseBrowser()
    if (!supabase) {
        if (!connectionFailureLogged) {
            console.warn('[Realtime] Supabase not configured - realtime features disabled')
            connectionFailureLogged = true
        }
        return null
    }
    return supabase.channel(channelName)
}

/**
 * Subscribes to changes on a table (via o broadcast compartilhado `dispara-db`)
 *
 * A assinatura fica amarrada a `channel`: removeChannel(channel) a cancela.
 * `payload.new`/`payload.old` trazem SÓ as colunas whitelisted na migration
 * (ids, status, contadores, timestamps) — nunca PII.
 *
 * @param channel - The channel that owns this subscription (lifecycle)
 * @param table - Table name to listen to
 * @param event - Event type (INSERT, UPDATE, DELETE, *)
 * @param callback - Handler for received events
 * @param filter - Optional filter `coluna=eq.valor` (e.g., 'id=eq.123'), aplicado no cliente
 * @returns The channel
 */
export function subscribeToTable<T extends Record<string, unknown> = Record<string, unknown>>(
    channel: RealtimeChannel,
    table: RealtimeTable,
    event: RealtimeEventType,
    callback: (payload: RealtimePayload<T>) => void,
    filter?: string
): RealtimeChannel {
    const unsubscribe = subscribeToDbChanges(
        (dbEvent) => callback(toRealtimePayload<T>(dbEvent)),
        { table, event, filter }
    )

    const existing = channelDbSubscriptions.get(channel)
    if (existing) existing.push(unsubscribe)
    else channelDbSubscriptions.set(channel, [unsubscribe])

    return channel
}

/**
 * Activates channel subscription with retry logic
 * 
 * @param channel - The channel to activate
 * @param onStatusChange - Optional callback for status changes
 * @param options - Optional configuration for retries
 * @returns Promise that resolves when subscribed
 */
export async function activateChannel(
    channel: RealtimeChannel,
    onStatusChange?: (status: ChannelStatus) => void,
    options?: { maxRetries?: number; silent?: boolean }
): Promise<void> {
    const { maxRetries = REALTIME_CONFIG.maxRetries, silent = false } = options || {}
    
    // Throttle connection attempts to avoid spam
    const now = Date.now()
    if (now - lastConnectionAttempt < 2000) {
        await new Promise(resolve => setTimeout(resolve, 2000 - (now - lastConnectionAttempt)))
    }
    lastConnectionAttempt = Date.now()

    return new Promise((resolve, reject) => {
        let retryCount = 0
        let resolved = false

        const attemptSubscribe = () => {
            channel.subscribe((status) => {
                onStatusChange?.(status as ChannelStatus)

                if (resolved) return

                if (status === 'SUBSCRIBED') {
                    resolved = true
                    connectionFailureLogged = false // Reset on success
                    resolve()
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    if (retryCount < maxRetries) {
                        retryCount++
                        const delay = REALTIME_CONFIG.baseDelayMs * Math.pow(2, retryCount - 1)
                        if (REALTIME_CONFIG.debug && !silent) {
                            console.warn(`[Realtime] Connection failed, retry ${retryCount}/${maxRetries} in ${delay}ms`)
                        }
                        setTimeout(attemptSubscribe, delay)
                    } else {
                        resolved = true
                        if (!connectionFailureLogged && !silent) {
                            console.warn('[Realtime] Connection failed after retries. Check: 1) Supabase Dashboard > Realtime (Broadcast habilitado e canais públicos permitidos), 2) WebSocket not blocked by firewall/proxy, 3) Supabase service status')
                            connectionFailureLogged = true
                        }
                        reject(new Error(`Channel subscription failed: ${status}`))
                    }
                }
            })
        }

        attemptSubscribe()
    })
}

/**
 * Removes a channel and all its subscriptions
 * 
 * @param channel - The channel to remove
 */
export function removeChannel(channel: RealtimeChannel): void {
    // Cancela (síncrono) as assinaturas do hub feitas com este canal
    const dbSubscriptions = channelDbSubscriptions.get(channel)
    if (dbSubscriptions) {
        channelDbSubscriptions.delete(channel)
        dbSubscriptions.forEach((unsubscribe) => unsubscribe())
    }

    const supabase = getSupabaseBrowser()
    if (!supabase) return
    supabase.removeChannel(channel)
}

// ============================================================================
// BROADCAST (EPHEMERAL EVENTS)
// ============================================================================

export interface BroadcastMessage<TPayload = unknown> {
    type: 'broadcast'
    event: string
    payload: TPayload
}

/**
 * Subscribes to Broadcast events on a channel.
 * Useful for ephemeral "live progress" without DB writes.
 */
export function subscribeToBroadcast<TPayload = unknown>(
    channel: RealtimeChannel,
    event: string,
    callback: (message: BroadcastMessage<TPayload>) => void
): RealtimeChannel {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return channel.on('broadcast' as any, { event } as any, (msg: any) => {
        callback(msg as BroadcastMessage<TPayload>)
    })
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Creates a subscription to a single table with automatic cleanup
 * Convenience function for simple use cases
 * 
 * @param table - Table name
 * @param event - Event type
 * @param callback - Handler function
 * @param filter - Optional filter
 * @returns Cleanup function to remove subscription
 */
export function createTableSubscription<T extends Record<string, unknown> = Record<string, unknown>>(
    table: RealtimeTable,
    event: RealtimeEventType,
    callback: (payload: RealtimePayload<T>) => void,
    filter?: string
): () => void {
    const channelName = `${table}-${Date.now()}`
    const channel = createRealtimeChannel(channelName)

    // Return no-op cleanup if Supabase not configured
    if (!channel) {
        console.warn('[Realtime] Supabase not configured, skipping subscription')
        return () => { }
    }

    subscribeToTable<T>(channel, table, event, callback, filter)

    // Activate without waiting
    activateChannel(channel).catch((err) => {
        console.error(`[Realtime] Failed to subscribe to ${table}:`, err)
    })

    // Return cleanup function
    return () => removeChannel(channel)
}

