/**
 * T069: Lightweight hook for unread conversations count
 * Used by sidebar to display unread badge without loading full conversation data
 *
 * A contagem vem da API autenticada (/api/inbox/unread-count) — o browser não lê
 * mais tabelas direto com a chave publishable. A atualização em tempo real é feita
 * pelo CentralizedRealtimeProvider, que invalida ['inbox-unread-count'] a cada
 * evento de inbox_conversations/inbox_messages do broadcast `dispara-db`.
 */

import { useQuery } from '@tanstack/react-query'

export const UNREAD_COUNT_KEY = ['inbox-unread-count']

export async function fetchUnreadCount(): Promise<number> {
  const response = await fetch('/api/inbox/unread-count', { cache: 'no-store' })
  if (!response.ok) {
    // 401/5xx: badge some em vez de quebrar a sidebar (o shell trata sessão expirada)
    return 0
  }
  const data = (await response.json().catch(() => null)) as { count?: unknown } | null
  const count = Number(data?.count)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

/**
 * Lightweight hook that returns total count of unread conversations
 * Refreshed by realtime invalidation (CentralizedRealtimeProvider)
 */
export function useUnreadCount() {
  // Query for unread count
  const query = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: fetchUnreadCount,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  })

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  }
}
