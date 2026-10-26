'use client'

/**
 * CentralizedRealtimeProvider
 *
 * Centralizes Supabase Realtime subscriptions to avoid multiple channels
 * being created for the same tables. Components can subscribe to table
 * changes through the context instead of creating their own channels.
 *
 * Benefits:
 * - Single channel for all table subscriptions
 * - Debounced invalidations to batch rapid updates
 * - Automatic cleanup on unmount
 * - Reduced Supabase connection overhead
 *
 * Os eventos chegam por Broadcast from Database no canal compartilhado
 * `dispara-db` (lib/supabase-realtime.ts). `event.new`/`event.old` trazem SÓ
 * colunas whitelisted (ids, status, contadores, timestamps), sem PII — o canal
 * é público. Use o evento como sinal e busque o resto pela API autenticada.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onDbChangesStatus, subscribeToDbChanges } from '@/lib/supabase-realtime'
import { toRealtimeEvent, type RealtimeEvent } from '@/lib/realtime-db-change'
import { createRealtimeInvalidator, REALTIME_INVALIDATION_MAX_WAIT_MS } from '@/lib/realtime-invalidation'

// =============================================================================
// TYPES
// =============================================================================

export type { RealtimeEvent }

type SubscriptionCallback = (event: RealtimeEvent) => void

interface CentralizedRealtimeContextValue {
  /**
   * Subscribe to changes on a table
   * @returns Unsubscribe function
   */
  subscribe: (table: string, callback: SubscriptionCallback) => () => void

  /**
   * Check if realtime is connected
   */
  isConnected: boolean
}

// =============================================================================
// CONTEXT
// =============================================================================

const CentralizedRealtimeContext = createContext<CentralizedRealtimeContextValue | null>(null)

// =============================================================================
// PROVIDER
// =============================================================================

interface CentralizedRealtimeProviderProps {
  children: ReactNode
  /**
   * Tables to subscribe to
   * @default ['campaigns', 'contacts', 'templates', 'flows', 'inbox_conversations', 'inbox_messages']
   */
  tables?: string[]
  /**
   * Debounce time for batching rapid updates (ms)
   * @default 200
   */
  debounceMs?: number
  /**
   * Teto (ms) para uma rajada adiar as invalidações (flush garantido sob flood)
   * @default 1000
   */
  maxWaitMs?: number
}

export function CentralizedRealtimeProvider({
  children,
  // T072: Added inbox tables for real-time updates
  tables = ['campaigns', 'contacts', 'templates', 'flows', 'inbox_conversations', 'inbox_messages'],
  debounceMs = 200,
  maxWaitMs = REALTIME_INVALIDATION_MAX_WAIT_MS,
}: CentralizedRealtimeProviderProps) {
  const queryClient = useQueryClient()
  const subscribersRef = useRef<Map<string, Set<SubscriptionCallback>>>(new Map())
  const isConnectedRef = useRef(false)

  // Notify all subscribers for a table
  const notifySubscribers = useCallback((table: string, event: RealtimeEvent) => {
    const subs = subscribersRef.current.get(table)
    if (subs && subs.size > 0) {
      subs.forEach(callback => {
        try {
          callback(event)
        } catch (err) {
          console.error(`[CentralizedRealtime] Subscriber error for ${table}:`, err)
        }
      })
    }
  }, [])

  // Debounced query invalidation helper
  // Acumula todas as query keys chamadas dentro da janela de debounce
  // e invalida todas de uma vez. Resolve o bug onde chamadas sequenciais
  // (ex: ['campaigns'] seguido de ['campaignStats']) cancelavam as anteriores.
  // Com maxWait: sob rajada (o canal é público e aceita eventos forjados) ainda há
  // um flush a cada maxWaitMs, e um fetch em curso não é cancelado a cada evento.
  const invalidator = useMemo(
    () => createRealtimeInvalidator(queryClient, { waitMs: debounceMs, maxWaitMs }),
    [queryClient, debounceMs, maxWaitMs]
  )
  const debouncedInvalidate = useCallback((queryKey: string[]) => {
    invalidator.invalidate(queryKey)
  }, [invalidator])

  // Setup realtime subscription (canal compartilhado `dispara-db`)
  useEffect(() => {
    const tableSet = new Set(tables)

    // Sem Supabase configurado (wizard de setup / env ausente) o hub devolve no-op.
    const unsubscribe = subscribeToDbChanges((dbEvent) => {
      const table = dbEvent.table
      if (!tableSet.has(table)) return

      const event: RealtimeEvent = toRealtimeEvent(dbEvent)

      // Notify subscribers
      notifySubscribers(table, event)

      // Default behavior: invalidate related queries
      debouncedInvalidate([table])

      // Also invalidate stats queries
      if (table === 'contacts') {
        debouncedInvalidate(['contactStats'])
        debouncedInvalidate(['contactTags'])
      }
      if (table === 'campaigns') {
        debouncedInvalidate(['campaignStats'])
      }
      // T072: Invalidate inbox queries on inbox table changes
      if (table === 'inbox_conversations') {
        debouncedInvalidate(['inbox-conversations'])
        debouncedInvalidate(['inbox-unread-count'])
      }
      if (table === 'inbox_messages') {
        debouncedInvalidate(['inbox-messages'])
        // Also invalidate unread count when new messages arrive
        debouncedInvalidate(['inbox-unread-count'])
        // A lista de conversas (ordem, prévia, conversa nova) também muda com a mensagem:
        // o banco não publica INSERT de conversa nem o contador de saída
        // (increment_conversation_counters) — ver a migration de hardening.
        debouncedInvalidate(['inbox-conversations'])
        // Idem para o detalhe da conversa aberta (useConversation): total_messages,
        // last_message_at e contato não são publicados pelo UPDATE de inbox_conversations.
        debouncedInvalidate(['inbox-conversation'])
      }
    })

    // Connection status (canal compartilhado)
    let hasLoggedError = false
    const unsubscribeStatus = onDbChangesStatus((status) => {
      isConnectedRef.current = status === 'SUBSCRIBED'
      if (status === 'SUBSCRIBED') {
        hasLoggedError = false // Reset para logar novamente se reconectar e falhar depois
      } else if ((status === 'CLOSED' || status === 'CHANNEL_ERROR') && !hasLoggedError) {
        // Loga apenas uma vez para não poluir o console
        console.warn('[Realtime] Conexão falhou. Tentando reconectar automaticamente...')
        hasLoggedError = true
      }
    })

    // Cleanup (o canal compartilhado continua aberto para os demais assinantes)
    return () => {
      invalidator.cancel()
      unsubscribe()
      unsubscribeStatus()
      isConnectedRef.current = false
    }
  }, [tables.join(','), notifySubscribers, debouncedInvalidate, invalidator])

  // Subscribe function for consumers
  const subscribe = useCallback((table: string, callback: SubscriptionCallback): (() => void) => {
    if (!subscribersRef.current.has(table)) {
      subscribersRef.current.set(table, new Set())
    }

    subscribersRef.current.get(table)!.add(callback)

    // Return unsubscribe function
    return () => {
      const subs = subscribersRef.current.get(table)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) {
          subscribersRef.current.delete(table)
        }
      }
    }
  }, [])

  // Memoize context value to prevent re-renders
  const value = useMemo<CentralizedRealtimeContextValue>(
    () => ({
      subscribe,
      isConnected: isConnectedRef.current,
    }),
    [subscribe]
  )

  return (
    <CentralizedRealtimeContext.Provider value={value}>
      {children}
    </CentralizedRealtimeContext.Provider>
  )
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access centralized realtime functionality
 */
export function useCentralizedRealtime() {
  const ctx = useContext(CentralizedRealtimeContext)
  if (!ctx) {
    throw new Error('useCentralizedRealtime must be used within CentralizedRealtimeProvider')
  }
  return ctx
}

/**
 * Hook to subscribe to a specific table's realtime events
 * Automatically unsubscribes on unmount
 */
export function useRealtimeSubscription(
  table: string,
  callback: SubscriptionCallback,
  enabled = true
) {
  const { subscribe } = useCentralizedRealtime()

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = subscribe(table, callback)
    return unsubscribe
  }, [table, callback, enabled, subscribe])
}
