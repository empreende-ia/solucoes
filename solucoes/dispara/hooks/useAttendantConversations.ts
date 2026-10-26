/**
 * Hook para buscar conversas na página de atendimento
 *
 * Usa React Query para cache e refetch automático.
 * Formata dados especificamente para a UI de atendimento.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isTransientHttpStatus } from '@/components/attendant/attendant-reconnect'

// =============================================================================
// TIPOS
// =============================================================================

export type AttendantConversationStatus = 'ai_active' | 'human_active' | 'handoff_requested' | 'resolved'

export interface AttendantConversation {
  id: string
  contactName: string
  contactPhone: string
  contactAvatar?: string
  status: AttendantConversationStatus
  lastMessage: string
  lastMessageAt: string // ISO string para serialização
  unreadCount: number
  isTyping?: boolean
  aiAgentName?: string
}

interface ConversationsResponse {
  conversations: AttendantConversation[]
  counts: {
    total: number
    urgent: number
    ai: number
    human: number
    resolved: number
  }
}

interface UseAttendantConversationsOptions {
  status?: 'open' | 'closed'
  search?: string
  buttonPayload?: string
  templateName?: string
  enabled?: boolean
  refetchInterval?: number
}

// =============================================================================
// ERROS
// =============================================================================

/** Erro HTTP da API do atendimento (preserva o status para tratar 401/403). */
export class AttendantApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AttendantApiError'
    this.status = status
  }
}

/** 401/403: sessão expirada, token revogado ou sem permissão — não adianta repetir. */
export function isAttendantAuthError(error: unknown): error is AttendantApiError {
  return error instanceof AttendantApiError && (error.status === 401 || error.status === 403)
}

/**
 * Falha transitória: 503 (banco indisponível — proxy responde com Retry-After),
 * outros 5xx, 408/429 ou falha de rede (fetch rejeita com TypeError). A sessão
 * continua válida: o polling segue e a UI mostra "reconectando", nunca "Acesso Negado".
 */
export function isAttendantTransientError(error: unknown): boolean {
  if (error instanceof AttendantApiError) return isTransientHttpStatus(error.status)
  return error instanceof TypeError
}

/** refetchInterval das queries da PWA: só para o polling em 401/403. */
export function attendantPollingInterval(error: unknown, interval: number): number | false {
  return isAttendantAuthError(error) ? false : interval
}

/** retry das queries da PWA: nunca em 401/403; nos demais erros, até 3 tentativas. */
export function shouldRetryAttendantQuery(failureCount: number, error: unknown): boolean {
  return !isAttendantAuthError(error) && failureCount < 3
}

/**
 * Último erro de uma query da PWA, estável durante as novas rodadas de busca.
 *
 * Sem dados em cache, o react-query v5 volta a query para 'pending' com `error: null`
 * (e `failureReason: null`) toda vez que uma busca começa: tick do refetchInterval,
 * "Tentar agora", foco na janela. Com o banco fora desde o primeiro carregamento, o
 * "reconectando" sumia a cada tick do polling e voltava ~7s depois (fim dos retries),
 * alternando com o spinner/skeleton. Aqui o último erro só sai quando a query volta a
 * ter sucesso. Com dados em cache o react-query já mantém o erro; nada muda.
 *
 * `resetKey` identifica a query (ex.: filtros/busca serializados): ao trocar de chave
 * o erro guardado da chave anterior é descartado, para a primeira carga da nova chave
 * mostrar o skeleton e não a faixa de reconexão com a lista vazia.
 */
export function useStickyQueryError<TError>(
  error: TError | null,
  isSuccess: boolean,
  resetKey = ''
): TError | null {
  const [state, setState] = useState<{ key: string; error: TError | null }>({ key: resetKey, error: null })
  const lastError = state.key === resetKey ? state.error : null

  // Ajuste de estado durante a renderização (padrão do React para guardar algo da
  // renderização anterior): sem efeito e sem um frame com o valor antigo.
  if (state.key !== resetKey) {
    setState({ key: resetKey, error: error ?? null })
  } else if (error != null && error !== state.error) {
    setState({ key: resetKey, error })
  } else if (error == null && isSuccess && state.error != null) {
    setState({ key: resetKey, error: null })
  }

  if (error != null) return error
  return isSuccess ? null : lastError
}

// =============================================================================
// FETCHER
// =============================================================================

async function fetchConversations(
  status?: string,
  search?: string,
  buttonPayload?: string,
  templateName?: string
): Promise<ConversationsResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (search) params.set('search', search)
  if (buttonPayload) params.set('button', buttonPayload)
  if (templateName) params.set('template', templateName)

  const url = `/api/attendant/conversations${params.toString() ? `?${params}` : ''}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new AttendantApiError('Falha ao carregar conversas', response.status)
  }

  return response.json()
}

// =============================================================================
// HOOK
// =============================================================================

export function useAttendantConversations(options: UseAttendantConversationsOptions = {}) {
  const {
    status,
    search,
    buttonPayload,
    templateName,
    enabled = true,
    refetchInterval = 10000, // Refetch a cada 10 segundos
  } = options

  const query = useQuery({
    queryKey: ['attendant-conversations', status, search, buttonPayload, templateName],
    queryFn: () => fetchConversations(status, search, buttonPayload, templateName),
    // Só busca depois que a sessão do atendente foi validada (senão toma 401)
    enabled,
    // Para o polling só quando a sessão caiu ou o acesso foi revogado (401/403);
    // 503/5xx/rede são transitórios e o polling continua
    refetchInterval: (q) => attendantPollingInterval(q.state.error, refetchInterval),
    retry: shouldRetryAttendantQuery,
    staleTime: 5000, // Considera dados frescos por 5 segundos
  })

  // Sobrevive ao início de cada nova rodada do polling (ver useStickyQueryError)
  const error = useStickyQueryError(
    query.error,
    query.isSuccess,
    JSON.stringify([status, search, buttonPayload, templateName])
  )

  return {
    conversations: query.data?.conversations || [],
    counts: query.data?.counts || { total: 0, urgent: 0, ai: 0, human: 0, resolved: 0 },
    // Só a primeira carga: com um erro já conhecido, a nova rodada não volta para o
    // skeleton — a faixa de reconexão continua na tela
    isLoading: query.isLoading && error == null,
    isRefetching: query.isRefetching,
    error,
    isReconnecting: isAttendantTransientError(error),
    refetch: query.refetch,
  }
}

// =============================================================================
// HELPERS
// =============================================================================

export function formatRelativeTime(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `${diffMins}min`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function getStatusEmoji(status: AttendantConversationStatus): string {
  const emojis: Record<AttendantConversationStatus, string> = {
    ai_active: '🤖',
    human_active: '👤',
    handoff_requested: '🚨',
    resolved: '✅',
  }
  return emojis[status]
}

export function getStatusLabel(status: AttendantConversationStatus): string {
  const labels: Record<AttendantConversationStatus, string> = {
    ai_active: 'IA Ativo',
    human_active: 'Humano',
    handoff_requested: 'Quer Humano',
    resolved: 'Resolvido',
  }
  return labels[status]
}

export function getStatusColor(status: AttendantConversationStatus): string {
  const colors: Record<AttendantConversationStatus, string> = {
    ai_active: 'text-blue-500',
    human_active: 'text-green-500',
    handoff_requested: 'text-red-500',
    resolved: 'text-slate-500',
  }
  return colors[status]
}
