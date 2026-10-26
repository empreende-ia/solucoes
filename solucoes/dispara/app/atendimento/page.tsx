'use client'

/**
 * Atendimento Page - Lista de Conversas
 *
 * Implementa Geist Design System com visual clean e minimalista.
 * Filtros por status: Todos, Urgente, IA, Humano
 */

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, LogOut, ShieldAlert, Loader2, Sparkles, User, AlertCircle, FileText, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useTemplatesWithButtons } from '@/hooks/useTemplatesWithButtons'
import { useAttendant } from '@/components/attendant/AttendantProvider'
import { AttendantReconnectingBanner, AttendantReconnectingPage } from '@/components/attendant/AttendantReconnecting'
import {
  useAttendantConversations,
  formatRelativeTime,
  isAttendantAuthError,
  type AttendantConversation,
} from '@/hooks/useAttendantConversations'

// =============================================================================
// TIPOS
// =============================================================================

type FilterTab = 'all' | 'urgent' | 'ai' | 'human'

// Helper para formatar tempo de espera
function formatWaitTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `há ${diffMins}min`
  if (diffHours < 24) return `há ${diffHours}h`
  return 'há +1 dia'
}

// =============================================================================
// COMPONENTES - Filter Tabs
// =============================================================================

// Tab color mapping - Simplified palette: green, red, neutral
const WHATSAPP_GREEN = '#00a884'
const TAB_COLORS: Record<FilterTab, { active: string; activeText: string; icon: string }> = {
  all: { active: 'var(--geist-foreground)', activeText: 'var(--geist-background)', icon: 'var(--geist-foreground-secondary)' },
  urgent: { active: 'var(--geist-red)', activeText: '#ffffff', icon: 'var(--geist-red)' },
  ai: { active: 'var(--geist-foreground-secondary)', activeText: 'var(--geist-background)', icon: 'var(--geist-foreground-tertiary)' },
  human: { active: WHATSAPP_GREEN, activeText: '#ffffff', icon: WHATSAPP_GREEN },
}

function FilterTabs({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: FilterTab
  onTabChange: (tab: FilterTab) => void
  counts: Record<FilterTab, number>
}) {
  const tabs: { id: FilterTab; label: string; icon?: React.ReactNode }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'urgent', label: 'Urgente', icon: <AlertCircle size={14} /> },
    { id: 'ai', label: 'IA', icon: <Sparkles size={14} /> },
    { id: 'human', label: 'Humano', icon: <User size={14} /> },
  ]

  return (
    <div
      className="flex gap-1.5 px-4 py-3 overflow-x-auto scrollbar-hide"
      style={{ borderBottom: '1px solid var(--geist-border)' }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        const count = counts[tab.id]
        const colors = TAB_COLORS[tab.id]

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              backgroundColor: isActive ? colors.active : 'transparent',
              color: isActive ? colors.activeText : colors.icon,
              border: isActive ? 'none' : `1px solid var(--geist-border)`,
            }}
          >
            {tab.icon}
            {tab.label}
            {count > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center font-semibold"
                style={{
                  backgroundColor: isActive
                    ? 'rgba(0,0,0,0.2)'
                    : 'var(--geist-component-bg)',
                  color: isActive ? colors.activeText : 'var(--geist-foreground)',
                }}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// =============================================================================
// COMPONENTES - Conversation Item
// =============================================================================

function ConversationItem({
  conversation,
  onClick,
}: {
  conversation: AttendantConversation
  onClick: () => void
}) {
  const isUrgent = conversation.status === 'handoff_requested'
  const isAI = conversation.status === 'ai_active'

  // Avatar color based on status - simplified palette
  const getAvatarStyle = () => {
    if (isUrgent) return { bg: 'var(--geist-red)', color: '#ffffff' }
    if (isAI) return { bg: 'var(--geist-foreground-secondary)', color: 'var(--geist-background)' }
    return { bg: WHATSAPP_GREEN, color: '#ffffff' }
  }
  const avatarStyle = getAvatarStyle()

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-4 transition-all"
      style={{
        borderBottom: '1px solid var(--geist-border)',
        backgroundColor: isUrgent ? 'var(--geist-error-light)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isUrgent) {
          e.currentTarget.style.backgroundColor = 'var(--geist-component-bg)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isUrgent ? 'var(--geist-error-light)' : 'transparent'
      }}
    >
      <div className="flex gap-3">
        {/* Avatar - colorido por status */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 shadow-sm"
          style={{
            backgroundColor: avatarStyle.bg,
            color: avatarStyle.color,
          }}
        >
          {conversation.contactAvatar || conversation.contactName.charAt(0).toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="font-semibold truncate"
              style={{ color: 'var(--geist-foreground)' }}
            >
              {conversation.contactName}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p
              className="text-sm truncate"
              style={{ color: 'var(--geist-foreground-secondary)' }}
            >
              {conversation.isTyping ? (
                <span style={{ color: 'var(--geist-green)' }}>Digitando...</span>
              ) : (
                conversation.lastMessage
              )}
            </p>

            {conversation.unreadCount > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full min-w-[22px] text-center shrink-0 font-bold"
                style={{
                  backgroundColor: isUrgent ? 'var(--geist-red)' : 'var(--geist-blue)',
                  color: '#ffffff',
                }}
              >
                {conversation.unreadCount}
              </span>
            )}
          </div>

          {/* Status badge - consolidated with AI agent name */}
          <div className="mt-2 flex items-center gap-2">
            <span
              className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: isUrgent
                  ? 'var(--geist-error-light)'
                  : isAI
                    ? 'var(--geist-component-bg)'
                    : 'rgba(0, 168, 132, 0.15)',
                color: isUrgent
                  ? 'var(--geist-red)'
                  : isAI
                    ? 'var(--geist-foreground-secondary)'
                    : WHATSAPP_GREEN,
              }}
            >
              {isUrgent && <AlertCircle size={12} />}
              {isAI && <Sparkles size={12} />}
              {!isUrgent && !isAI && <User size={12} />}
              {isUrgent
                ? `Aguardando ${formatWaitTime(conversation.lastMessageAt)}`
                : isAI
                  ? `${conversation.aiAgentName || 'IA'} · ${formatRelativeTime(conversation.lastMessageAt)}`
                  : `Humano · ${formatRelativeTime(conversation.lastMessageAt)}`}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// =============================================================================
// COMPONENTES - Empty State
// =============================================================================

function EmptyState({ filter }: { filter: FilterTab }) {
  const messages: Record<FilterTab, { icon: React.ReactNode; title: string; description: string }> = {
    all: {
      icon: <Search size={32} style={{ color: 'var(--geist-foreground-tertiary)' }} />,
      title: 'Nenhuma conversa',
      description: 'Suas conversas aparecerão aqui',
    },
    urgent: {
      icon: <AlertCircle size={32} style={{ color: 'var(--geist-foreground-tertiary)' }} />,
      title: 'Nenhuma urgência',
      description: 'Nenhum cliente pedindo atendente humano',
    },
    ai: {
      icon: <Sparkles size={32} style={{ color: 'var(--geist-foreground-tertiary)' }} />,
      title: 'Nenhuma IA ativa',
      description: 'Conversas com IA aparecerão aqui',
    },
    human: {
      icon: <User size={32} style={{ color: 'var(--geist-foreground-tertiary)' }} />,
      title: 'Nenhum atendimento',
      description: 'Conversas com humanos aparecerão aqui',
    },
  }

  const msg = messages[filter]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: 'var(--geist-component-bg)' }}
      >
        {msg.icon}
      </div>
      <h3
        className="text-base font-medium mb-1"
        style={{ color: 'var(--geist-foreground)' }}
      >
        {msg.title}
      </h3>
      <p
        className="text-sm"
        style={{ color: 'var(--geist-foreground-tertiary)' }}
      >
        {msg.description}
      </p>
    </div>
  )
}

// =============================================================================
// PÁGINAS DE ESTADO
// =============================================================================

function ErrorPage({ error }: { error: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-4 text-center"
      style={{ backgroundColor: 'var(--geist-background)' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: 'var(--geist-error-light)' }}
      >
        <ShieldAlert size={32} style={{ color: 'var(--geist-error)' }} />
      </div>
      <h1
        className="text-xl font-semibold mb-2"
        style={{ color: 'var(--geist-foreground)' }}
      >
        Acesso Negado
      </h1>
      <p
        className="mb-6 max-w-sm"
        style={{ color: 'var(--geist-foreground-secondary)' }}
      >
        {error}
      </p>
      <p
        className="text-sm"
        style={{ color: 'var(--geist-foreground-tertiary)' }}
      >
        Se você é um atendente, solicite um novo link de acesso ao administrador.
      </p>
    </div>
  )
}

function LoadingPage() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen"
      style={{ backgroundColor: 'var(--geist-background)' }}
    >
      <Loader2
        className="w-8 h-8 animate-spin mb-4"
        style={{ color: 'var(--geist-foreground-tertiary)' }}
      />
      <p style={{ color: 'var(--geist-foreground-secondary)' }}>Validando acesso...</p>
    </div>
  )
}

// =============================================================================
// PÁGINA PRINCIPAL
// =============================================================================

export default function AtendimentoPage() {
  const router = useRouter()
  const { isReady, isValidating, isAuthenticated, isReconnecting, error, attendant, logout, retryNow } = useAttendant()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [buttonFilter, setButtonFilter] = useState<string | null>(null)
  const [templateFilter, setTemplateFilter] = useState<string | null>(null)

  const { templates: templatesWithButtons } = useTemplatesWithButtons({ enabled: isAuthenticated })
  const activeTemplateMeta = useMemo(
    () => templatesWithButtons.find((t) => t.name === templateFilter),
    [templatesWithButtons, templateFilter]
  )
  const buttonTabs = activeTemplateMeta?.buttons ?? []

  useEffect(() => {
    if (buttonFilter && buttonTabs.length > 0 && !buttonTabs.includes(buttonFilter)) {
      setButtonFilter(null)
    }
  }, [buttonFilter, buttonTabs])

  // Buscar conversas reais da API
  const {
    conversations,
    counts: apiCounts,
    isLoading,
    isRefetching,
    error: conversationsError,
    isReconnecting: conversationsReconnecting,
    refetch,
  } = useAttendantConversations({
    status: 'open',
    search: searchQuery || undefined,
    buttonPayload: buttonFilter || undefined,
    templateName: templateFilter || undefined,
    enabled: isAuthenticated,
  })

  // Filtrar conversas por tab
  const filteredConversations = useMemo(() => {
    let filtered = conversations

    switch (activeTab) {
      case 'urgent':
        filtered = filtered.filter((c) => c.status === 'handoff_requested')
        break
      case 'ai':
        filtered = filtered.filter((c) => c.status === 'ai_active')
        break
      case 'human':
        filtered = filtered.filter((c) => c.status === 'human_active')
        break
    }

    // Ordenar: urgentes primeiro, depois por data
    return filtered.sort((a, b) => {
      if (a.status === 'handoff_requested' && b.status !== 'handoff_requested') return -1
      if (b.status === 'handoff_requested' && a.status !== 'handoff_requested') return 1
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    })
  }, [activeTab, conversations])

  // Contagens para as tabs
  const counts: Record<FilterTab, number> = useMemo(() => ({
    all: apiCounts.total,
    urgent: apiCounts.urgent,
    ai: apiCounts.ai,
    human: apiCounts.human,
  }), [apiCounts])

  // Loading state
  if (!isReady || isValidating) {
    return <LoadingPage />
  }

  // Banco/rede oscilando ao restaurar a sessão: não é "Acesso Negado" (o cookie
  // continua válido) — tenta de novo com backoff
  if (isReconnecting && !isAuthenticated) {
    return <AttendantReconnectingPage onRetry={retryNow} />
  }

  // Error state
  if (!isAuthenticated || error) {
    return <ErrorPage error={error || 'Token inválido'} />
  }

  // Sessão caiu no servidor (token revogado/expirado) ou sem permissão de visualizar
  if (isAttendantAuthError(conversationsError)) {
    return (
      <ErrorPage
        error={
          conversationsError.status === 403
            ? 'Você não tem permissão para visualizar conversas'
            : 'Sua sessão expirou ou o acesso foi revogado'
        }
      />
    )
  }

  return (
    <div
      className="flex flex-col h-screen"
      style={{ backgroundColor: 'var(--geist-background)' }}
    >
      {/* Header */}
      <header
        className="shrink-0 px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid var(--geist-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: 'var(--geist-foreground)' }}
            >
              Atendimento
            </h1>
            <p
              className="text-xs"
              style={{ color: 'var(--geist-foreground-tertiary)' }}
            >
              Olá, {attendant?.name}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {/* Refresh button */}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 rounded-md transition-colors disabled:opacity-50"
              title="Atualizar"
              style={{ color: 'var(--geist-foreground-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--geist-component-bg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <RefreshCw size={18} className={isRefetching ? 'animate-spin' : ''} />
            </button>
            {/* Logout button */}
            <button
              type="button"
              onClick={async () => {
                if (confirm('Deseja sair?')) {
                  // Apaga o cookie de sessão; recarrega para limpar o cache das consultas
                  await logout()
                  window.location.replace('/atendimento')
                }
              }}
              className="p-2 rounded-md transition-colors"
              title="Sair"
              style={{ color: 'var(--geist-foreground-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--geist-component-bg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--geist-foreground-tertiary)' }}
          />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-md text-sm focus:outline-none"
            style={{
              backgroundColor: 'var(--geist-component-bg)',
              color: 'var(--geist-foreground)',
              border: '1px solid var(--geist-border)',
            }}
          />
        </div>
      </header>

      {/* 503/5xx/rede no polling: a lista atual fica na tela e o polling continua */}
      {conversationsReconnecting && <AttendantReconnectingBanner />}

      {/* Filter tabs */}
      <FilterTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

      {/* Filtro por template + abas dos botões daquele template */}
      <div
        className="flex gap-1.5 px-4 py-2 overflow-x-auto scrollbar-hide items-center"
        style={{ borderBottom: '1px solid var(--geist-border)' }}
      >
        <button
          type="button"
          onClick={() => {
            setTemplateFilter(null)
            setButtonFilter(null)
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
          style={{
            backgroundColor: templateFilter === null && buttonFilter === null ? 'var(--geist-foreground)' : 'transparent',
            color: templateFilter === null && buttonFilter === null ? 'var(--geist-background)' : 'var(--geist-foreground-secondary)',
            border: templateFilter === null && buttonFilter === null ? 'none' : '1px solid var(--geist-border)',
          }}
        >
          Todas
        </button>

        {buttonTabs.map((btn) => {
          const active = buttonFilter === btn
          return (
            <button
              key={btn}
              type="button"
              onClick={() => {
                if (active) {
                  setButtonFilter(null)
                } else {
                  setButtonFilter(btn)
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: active ? WHATSAPP_GREEN : 'transparent',
                color: active ? '#ffffff' : 'var(--geist-foreground-secondary)',
                border: active ? 'none' : '1px solid var(--geist-border)',
              }}
            >
              {btn}
            </button>
          )
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: templateFilter ? 'var(--geist-accent, #10b981)' : 'transparent',
                color: templateFilter ? '#ffffff' : 'var(--geist-foreground-secondary)',
                border: templateFilter ? 'none' : '1px solid var(--geist-border)',
              }}
            >
              <FileText size={14} />
              <span className="max-w-[140px] truncate">
                {templateFilter || 'Template'}
              </span>
              <ChevronDown size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
              Template
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setTemplateFilter(null)
                setButtonFilter(null)
              }}
              className="text-xs"
            >
              Sem filtro de template
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {templatesWithButtons.length === 0 ? (
              <div className="px-2 py-1.5 text-[11px] opacity-60">Nenhum template com botões</div>
            ) : (
              templatesWithButtons.map((tpl) => (
                <DropdownMenuItem
                  key={tpl.name}
                  onSelect={() => {
                    setTemplateFilter(tpl.name)
                    setButtonFilter(null)
                  }}
                  className="text-xs flex flex-col items-start gap-0.5"
                >
                  <span className="font-medium truncate w-full">
                    {tpl.name}
                  </span>
                  <span className="text-[9px] opacity-60 truncate w-full">
                    {tpl.buttons.join(' · ')}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          // Loading skeleton
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex gap-3 p-4 animate-pulse"
                style={{ borderBottom: '1px solid var(--geist-border)' }}
              >
                <div
                  className="w-10 h-10 rounded-full"
                  style={{ backgroundColor: 'var(--geist-component-bg)' }}
                />
                <div className="flex-1 space-y-2">
                  <div
                    className="h-4 rounded w-1/3"
                    style={{ backgroundColor: 'var(--geist-component-bg)' }}
                  />
                  <div
                    className="h-3 rounded w-2/3"
                    style={{ backgroundColor: 'var(--geist-component-bg)' }}
                  />
                  <div
                    className="h-3 rounded w-1/4"
                    style={{ backgroundColor: 'var(--geist-component-bg)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <EmptyState filter={activeTab} />
        ) : (
          filteredConversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              onClick={() => router.push(`/atendimento/conversa/${conversation.id}`)}
            />
          ))
        )}
      </div>

      {/* Stats bar - Geist vibrant colors */}
      <div
        className="shrink-0 px-4 py-4"
        style={{
          backgroundColor: 'var(--geist-background-secondary)',
          borderTop: '1px solid var(--geist-border)',
        }}
      >
        <div className="flex items-center justify-around">
          {/* Total */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
              style={{
                backgroundColor: 'var(--geist-component-bg)',
                color: 'var(--geist-foreground)',
              }}
            >
              {counts.all}
            </div>
            <span className="text-xs" style={{ color: 'var(--geist-foreground-tertiary)' }}>
              Total
            </span>
          </div>

          {/* Urgente */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
              style={{
                backgroundColor: counts.urgent > 0 ? 'var(--geist-red)' : 'var(--geist-component-bg)',
                color: counts.urgent > 0 ? '#ffffff' : 'var(--geist-foreground-tertiary)',
              }}
            >
              {counts.urgent}
            </div>
            <span className="text-xs" style={{ color: 'var(--geist-red)' }}>
              Urgente
            </span>
          </div>

          {/* IA */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
              style={{
                backgroundColor: counts.ai > 0 ? 'var(--geist-foreground-secondary)' : 'var(--geist-component-bg)',
                color: counts.ai > 0 ? 'var(--geist-background)' : 'var(--geist-foreground-tertiary)',
              }}
            >
              {counts.ai}
            </div>
            <span className="text-xs" style={{ color: 'var(--geist-foreground-secondary)' }}>
              IA
            </span>
          </div>

          {/* Humano */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
              style={{
                backgroundColor: counts.human > 0 ? WHATSAPP_GREEN : 'var(--geist-component-bg)',
                color: counts.human > 0 ? '#ffffff' : 'var(--geist-foreground-tertiary)',
              }}
            >
              {counts.human}
            </div>
            <span className="text-xs" style={{ color: WHATSAPP_GREEN }}>
              Humano
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
