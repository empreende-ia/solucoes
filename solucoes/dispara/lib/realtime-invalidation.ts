/**
 * Invalidação de queries disparada por eventos do canal realtime `dispara-db`.
 *
 * O canal é PÚBLICO: qualquer pessoa com a chave publishable consegue emitir eventos
 * nele (ver lib/realtime-db-change.ts). Por isso o evento é só um SINAL ("algo mudou
 * em X") e todo consumidor deve:
 *   1. nunca escrever valores do payload no cache (setQueryData/setState);
 *   2. invalidar a query (refetch pela API autenticada) com limite de taxa.
 *
 * Este helper faz o item 2: agrupa as query keys, aplica debounce com `maxWait`
 * (sob rajada contínua ainda há um flush a cada `maxWaitMs`, nunca adiado para
 * sempre) e não cancela um fetch em curso — se a query já está buscando, a
 * invalidação fica para o próximo flush. Assim um flood de eventos forjados custa
 * no máximo 1 fetch em voo por query, e nenhum fetch é cancelado antes de terminar.
 */

import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { debounce } from '@/lib/utils'

export const REALTIME_INVALIDATION_WAIT_MS = 200
export const REALTIME_INVALIDATION_MAX_WAIT_MS = 1000

export interface RealtimeInvalidatorOptions {
  /** Debounce (ms) depois do último sinal. Default: 200 */
  waitMs?: number
  /** Teto (ms) para uma rajada adiar a invalidação. Default: 1000 */
  maxWaitMs?: number
}

export interface RealtimeInvalidator {
  /** Agenda a invalidação de `queryKey` (prefixo, como em invalidateQueries). */
  invalidate: (queryKey: QueryKey) => void
  /** Descarta o que estiver pendente (desmontagem). */
  cancel: () => void
}

export function createRealtimeInvalidator(
  queryClient: QueryClient,
  options: RealtimeInvalidatorOptions = {}
): RealtimeInvalidator {
  const waitMs = options.waitMs ?? REALTIME_INVALIDATION_WAIT_MS
  const maxWaitMs = Math.max(options.maxWaitMs ?? REALTIME_INVALIDATION_MAX_WAIT_MS, waitMs)
  const pending = new Map<string, QueryKey>()

  const flush = debounce(
    () => {
      const entries = Array.from(pending.entries())
      pending.clear()

      let deferred = false
      for (const [hash, queryKey] of entries) {
        // Fetch em curso: não cancela (sob rajada, cancelar a cada flush impediria
        // qualquer refetch de terminar). Fica pendente para o próximo flush.
        if (queryClient.isFetching({ queryKey }) > 0) {
          pending.set(hash, queryKey)
          deferred = true
          continue
        }
        void queryClient.invalidateQueries({ queryKey })
      }

      if (deferred) flush()
    },
    waitMs,
    { maxWait: maxWaitMs }
  )

  return {
    invalidate(queryKey) {
      pending.set(hashKey(queryKey), queryKey)
      flush()
    },
    cancel() {
      pending.clear()
      flush.cancel()
    },
  }
}
