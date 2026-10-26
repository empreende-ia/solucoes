'use client'

/**
 * Conversa Page - Geist Design System
 *
 * Interface de chat minimalista seguindo os princípios do Geist:
 * - Hierarquia visual clara
 * - Espaçamento consistente
 * - Cores de alto contraste
 * - Transições suaves
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  XCircle,
  Sparkles,
} from 'lucide-react'
import { useAttendant } from '@/components/attendant/AttendantProvider'
import { AttendantReconnectingBanner, AttendantReconnectingPage } from '@/components/attendant/AttendantReconnecting'
import {
  AttendantApiError,
  attendantPollingInterval,
  isAttendantAuthError,
  isAttendantTransientError,
  shouldRetryAttendantQuery,
  useStickyQueryError,
} from '@/hooks/useAttendantConversations'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface Message {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  content: string
  message_type: string
  wa_message_id: string | null
  delivery_status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  is_ai_generated: boolean
  created_at: string
}

interface Contact {
  id: string
  name: string | null
  phone: string
}

interface Conversation {
  id: string
  phone: string
  status: string
  mode: 'bot' | 'human'
  priority: string | null
  ai_agent_id: string | null
  contact?: Contact | null
  ai_agent?: { name: string } | null
  last_message_at: string
}

type ConversationStatus = 'ai_active' | 'human_active' | 'handoff_requested'

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchConversation(id: string): Promise<Conversation> {
  const res = await fetch(`/api/inbox/conversations/${id}`)
  if (!res.ok) throw new AttendantApiError('Conversa não encontrada', res.status)
  return res.json()
}

async function fetchMessages(id: string, limit = 50): Promise<{ messages: Message[]; hasMore: boolean }> {
  const res = await fetch(`/api/inbox/conversations/${id}/messages?limit=${limit}`)
  if (!res.ok) throw new AttendantApiError('Erro ao buscar mensagens', res.status)
  return res.json()
}

async function sendMessage(conversationId: string, content: string): Promise<Message> {
  const res = await fetch(`/api/inbox/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, message_type: 'text' }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Erro ao enviar mensagem')
  }
  return res.json()
}

async function takeoverConversation(id: string): Promise<void> {
  const res = await fetch(`/api/inbox/conversations/${id}/takeover`, { method: 'POST' })
  if (!res.ok) throw new Error('Erro ao assumir conversa')
}

async function returnToBot(id: string): Promise<void> {
  const res = await fetch(`/api/inbox/conversations/${id}/return-to-bot`, { method: 'POST' })
  if (!res.ok) throw new Error('Erro ao devolver para IA')
}

// =============================================================================
// HELPERS
// =============================================================================

function mapConversationStatus(conv: Conversation): ConversationStatus {
  if (conv.priority === 'urgent') return 'handoff_requested'
  if (conv.mode === 'human') return 'human_active'
  return 'ai_active'
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// =============================================================================
// COMPONENTS
// =============================================================================

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === 'outbound'

  const StatusIcon = () => {
    switch (message.delivery_status) {
      case 'read':
        return <CheckCheck size={14} className="text-[var(--chat-status-read)]" />
      case 'delivered':
        return <CheckCheck size={14} />
      case 'sent':
        return <Check size={14} />
      case 'pending':
        return <Clock size={14} />
      case 'failed':
        return <XCircle size={14} className="text-[var(--geist-error)]" />
      default:
        return null
    }
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`
          relative px-4 py-2.5 rounded-2xl
          ${isOutbound
            ? 'bg-[var(--chat-bubble-outbound)] text-[var(--chat-bubble-outbound-text)] rounded-br-sm'
            : 'bg-[var(--chat-bubble-inbound)] text-[var(--chat-bubble-inbound-text)] rounded-bl-sm border border-[var(--geist-border)]'
          }
        `}
        style={{ maxWidth: 'min(75%, 500px)' }}
      >
        {/* AI Badge */}
        {message.is_ai_generated && (
          <div className="flex items-center gap-1 mb-1.5 -mt-0.5">
            <Sparkles size={12} className="text-[var(--geist-success)]" />
            <span className="text-[10px] font-medium text-[var(--geist-success)]">IA</span>
          </div>
        )}

        {/* Content */}
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {/* Footer: Time + Status */}
        <div className={`flex items-center gap-1.5 mt-1.5 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[11px] text-[var(--chat-timestamp)]">
            {formatTime(message.created_at)}
          </span>
          {isOutbound && (
            <span className="text-[var(--chat-timestamp)]">
              <StatusIcon />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function Header({
  conversation,
  onBack,
}: {
  conversation: Conversation
  onBack: () => void
}) {
  // Avatar color based on mode - simplified palette
  const getAvatarColor = () => {
    if (conversation.priority === 'urgent') return 'var(--geist-red)'
    if (conversation.mode === 'bot') return 'var(--geist-foreground-secondary)'
    return '#00a884' // Verde WhatsApp para modo humano
  }

  return (
    <header className="shrink-0 h-16 px-4 flex items-center gap-3 border-b border-[var(--geist-border)] bg-[var(--geist-background)]">
      <button
        onClick={onBack}
        className="p-2 -ml-2 rounded-lg hover:bg-[var(--geist-component-bg)] transition-colors"
        aria-label="Voltar"
      >
        <ArrowLeft size={20} className="text-[var(--geist-foreground-secondary)]" />
      </button>

      {/* Avatar colorido */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm"
        style={{
          backgroundColor: getAvatarColor(),
          color: '#ffffff',
        }}
      >
        {getInitials(conversation.contact?.name ?? null)}
      </div>

      <div className="flex-1 min-w-0">
        <h1 className="font-semibold text-[15px] truncate">
          {conversation.contact?.name || 'Desconhecido'}
        </h1>
        <p className="text-[13px] text-[var(--geist-foreground-tertiary)] truncate">
          {conversation.contact?.phone || conversation.phone}
        </p>
      </div>
    </header>
  )
}

function formatWaitTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `há ${diffMins}min`
  if (diffHours < 24) return `há ${diffHours}h`
  return `há mais de 1 dia`
}

function StatusBar({
  status,
  onTakeOver,
  onReturnToAI,
  isLoading,
  canReply,
  canHandoff,
  lastMessageAt,
}: {
  status: ConversationStatus
  onTakeOver: () => void
  onReturnToAI: () => void
  isLoading: boolean
  canReply: boolean
  canHandoff: boolean
  lastMessageAt?: string
}) {
  if (!canReply) return null

  const isAIActive = status === 'ai_active' || status === 'handoff_requested'
  const isUrgent = status === 'handoff_requested'
  const isHuman = status === 'human_active'
  const waitTime = lastMessageAt && isUrgent ? formatWaitTime(lastMessageAt) : null

  // Colors based on status - simplified palette (green, red, neutral)
  const getStatusStyles = () => {
    if (isUrgent) return {
      bg: 'var(--geist-error-light)',
      iconColor: 'var(--geist-red)',
      textColor: 'var(--geist-red)',
    }
    if (isAIActive) return {
      bg: 'var(--geist-component-bg)',
      iconColor: 'var(--geist-foreground-secondary)',
      textColor: 'var(--geist-foreground-secondary)',
    }
    // Modo humano - verde WhatsApp
    return {
      bg: 'rgba(0, 168, 132, 0.1)',
      iconColor: '#00a884',
      textColor: '#00a884',
    }
  }
  const statusStyles = getStatusStyles()

  return (
    <div
      className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-[var(--geist-border)]"
      style={{ backgroundColor: statusStyles.bg }}
    >
      <div className="flex items-center gap-2">
        {isUrgent ? (
          <>
            <AlertCircle size={16} style={{ color: statusStyles.iconColor }} />
            <span className="text-[13px] font-medium" style={{ color: statusStyles.textColor }}>
              Cliente aguardando {waitTime || 'atendimento'}
            </span>
          </>
        ) : isAIActive ? (
          <>
            <Sparkles size={16} style={{ color: statusStyles.iconColor }} />
            <span className="text-[13px] font-medium" style={{ color: statusStyles.textColor }}>
              IA está atendendo
            </span>
          </>
        ) : (
          <>
            <User size={16} style={{ color: statusStyles.iconColor }} />
            <span className="text-[13px] font-medium" style={{ color: statusStyles.textColor }}>
              Você está atendendo
            </span>
          </>
        )}
      </div>

      {isAIActive ? (
        <button
          onClick={onTakeOver}
          disabled={isLoading}
          className="px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all disabled:opacity-50 hover:brightness-110"
          style={{
            backgroundColor: isUrgent ? 'var(--geist-red)' : '#00a884',
            color: '#ffffff',
          }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Assumir'}
        </button>
      ) : canHandoff ? (
        <button
          onClick={onReturnToAI}
          disabled={isLoading}
          className="px-4 py-1.5 rounded-full text-[13px] font-medium transition-all disabled:opacity-50 hover:brightness-110"
          style={{
            backgroundColor: '#00a884',
            color: '#ffffff',
          }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Devolver para IA'}
        </button>
      ) : null}
    </div>
  )
}

function MessageInput({
  value,
  onChange,
  onSend,
  isLoading,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  isLoading: boolean
  disabled: boolean
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="shrink-0 px-4 py-3 border-t border-[var(--geist-border)] bg-[var(--geist-background)]">
      <div className="flex items-end gap-3">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem..."
          rows={1}
          disabled={disabled}
          className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--geist-component-bg)] text-[var(--geist-foreground)] placeholder:text-[var(--geist-foreground-tertiary)] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--geist-blue)] max-h-[120px] disabled:opacity-50 border border-[var(--geist-border)] focus:border-[var(--geist-blue)]"
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || isLoading || disabled}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-30 hover:scale-105 transition-all shadow-lg"
          style={{
            backgroundColor: 'var(--geist-blue)',
            color: '#ffffff',
          }}
          aria-label="Enviar"
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>
    </div>
  )
}

function DisabledInputNotice({ message }: { message: string }) {
  return (
    <div className="shrink-0 px-4 py-4 border-t border-[var(--geist-border)] bg-[var(--geist-background-secondary)]">
      <p className="text-[13px] text-[var(--geist-foreground-tertiary)] text-center">
        {message}
      </p>
    </div>
  )
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ConversaPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    isReady,
    isValidating,
    isAuthenticated,
    isReconnecting,
    error: authError,
    canReply,
    canHandoff,
    retryNow,
  } = useAttendant()

  const conversationId = params.id as string
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Queries
  const {
    data: conversation,
    isLoading: convLoading,
    isSuccess: convSuccess,
    error: convQueryError,
    refetch: refetchConversation,
  } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversation(conversationId),
    // Só busca com a sessão de atendente validada (cookie); para o polling só em
    // 401/403 — 503/5xx/rede seguem tentando
    enabled: isAuthenticated,
    refetchInterval: (q) => attendantPollingInterval(q.state.error, 5000),
    retry: shouldRetryAttendantQuery,
  })

  const {
    data: messagesData,
    isLoading: msgsLoading,
    isSuccess: msgsSuccess,
    error: msgsQueryError,
  } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchMessages(conversationId, 100),
    enabled: isAuthenticated,
    refetchInterval: (q) => attendantPollingInterval(q.state.error, 3000),
    retry: shouldRetryAttendantQuery,
  })

  // Sem dados em cache, o react-query zera o erro a cada nova rodada do polling; o
  // último erro fica até a próxima resposta boa (senão a tela alternava spinner ↔
  // "reconectando" a cada tick)
  const convError = useStickyQueryError(convQueryError, convSuccess)
  const msgsError = useStickyQueryError(msgsQueryError, msgsSuccess)

  const convTransient = isAttendantTransientError(convError)
  const connectionUnstable = convTransient || isAttendantTransientError(msgsError)

  const messages = messagesData?.messages ?? []
  const status = conversation ? mapConversationStatus(conversation) : 'ai_active'

  // Mutations
  const sendMutation = useMutation({
    mutationFn: (content: string) => sendMessage(conversationId, content),
    onSuccess: () => {
      setNewMessage('')
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const takeoverMutation = useMutation({
    mutationFn: () => takeoverConversation(conversationId),
    onSuccess: () => {
      toast.success('Você assumiu o atendimento')
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const returnMutation = useMutation({
    mutationFn: () => returnToBot(conversationId),
    onSuccess: () => {
      toast.success('Conversa devolvida para IA')
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = useCallback(() => {
    if (!newMessage.trim() || sendMutation.isPending) return
    sendMutation.mutate(newMessage.trim())
  }, [newMessage, sendMutation])

  const handleBack = () => {
    // A sessão segue pelo cookie httpOnly — o token não trafega mais na URL
    router.push('/atendimento')
  }

  const loadingSpinner = (
    <div className="min-h-screen flex items-center justify-center bg-[var(--geist-background)]">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--geist-foreground-tertiary)]" />
    </div>
  )

  // Validando a sessão (as queries só rodam autenticadas)
  if (!isReady || isValidating) {
    return loadingSpinner
  }

  // Banco/rede oscilando ao restaurar a sessão: o cookie continua válido — reconectando
  if (isReconnecting && !isAuthenticated) {
    return <AttendantReconnectingPage onRetry={retryNow} />
  }

  // Sem sessão de atendente (link sem token e sem cookie, token revogado/expirado)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-[var(--geist-background)]">
        <AlertCircle className="w-12 h-12 text-[var(--geist-error)] mb-4" />
        <h2 className="text-lg font-semibold mb-2">Acesso Negado</h2>
        <p className="text-sm text-[var(--geist-foreground-secondary)] max-w-sm">
          {authError || 'Sessão de atendente não encontrada'}
        </p>
      </div>
    )
  }

  // 503/5xx/rede antes de a conversa carregar: não é "não encontrada"; o polling segue.
  // Vem antes do spinner: sem dados, cada nova rodada volta a "carregando".
  if (!conversation && convTransient) {
    return <AttendantReconnectingPage onRetry={() => void refetchConversation()} />
  }

  // Primeira carga (um erro já conhecido não volta para o spinner a cada nova rodada)
  if ((convLoading && !convError) || (msgsLoading && !msgsError)) {
    return loadingSpinner
  }

  // Error (falha transitória com a conversa já carregada só mostra a faixa abaixo)
  if ((convError && !convTransient) || !conversation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[var(--geist-background)]">
        <AlertCircle className="w-12 h-12 text-[var(--geist-error)] mb-4" />
        <h2 className="text-lg font-semibold mb-2">
          {isAttendantAuthError(convError)
            ? convError.status === 403
              ? 'Sem permissão para visualizar esta conversa'
              : 'Sua sessão expirou ou o acesso foi revogado'
            : 'Conversa não encontrada'}
        </h2>
        <button
          onClick={handleBack}
          className="text-[var(--geist-success)] text-sm hover:underline"
        >
          Voltar para lista
        </button>
      </div>
    )
  }

  const canSendMessages = canReply && status === 'human_active'

  return (
    <div className="flex flex-col h-screen bg-[var(--geist-background)]">
      <Header
        conversation={conversation}
        onBack={handleBack}
      />

      {connectionUnstable && <AttendantReconnectingBanner />}

      <StatusBar
        status={status}
        onTakeOver={() => takeoverMutation.mutate()}
        onReturnToAI={() => returnMutation.mutate()}
        isLoading={takeoverMutation.isPending || returnMutation.isPending}
        canReply={canReply}
        canHandoff={canHandoff}
        lastMessageAt={conversation.last_message_at}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-[var(--geist-background)]">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[14px] text-[var(--geist-foreground-tertiary)]">
              Nenhuma mensagem ainda
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {canSendMessages ? (
        <MessageInput
          value={newMessage}
          onChange={setNewMessage}
          onSend={handleSend}
          isLoading={sendMutation.isPending}
          disabled={false}
        />
      ) : !canReply ? (
        <DisabledInputNotice message="Você tem permissão apenas para visualizar" />
      ) : (
        <DisabledInputNotice message="Assuma o atendimento para enviar mensagens" />
      )}
    </div>
  )
}
