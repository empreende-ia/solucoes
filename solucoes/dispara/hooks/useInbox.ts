/**
 * useInbox - Controller hook for the Inbox page
 * Orchestrates conversations, messages, labels, and quick replies
 */

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useConversations, useConversationMutations } from './useConversations'
import { useConversationWithMessages } from './useConversation'
import { useLabels } from './useLabels'
import { useQuickReplies } from './useQuickReplies'
import { useInboxSettings, getHumanModeTimeoutMs } from './useInboxSettings'
import { aiAgentService, type UpdateAIAgentParams } from '@/services/aiAgentService'
import type { ConversationStatus, ConversationMode, ConversationPriority, AIAgent, InboxConversation, InboxLabel, InboxQuickReply } from '@/types'

export interface InboxInitialData {
  conversations?: InboxConversation[]
  labels?: InboxLabel[]
  quickReplies?: InboxQuickReply[]
  totalUnread?: number
}

export interface UseInboxOptions {
  initialConversationId?: string | null
  initialData?: InboxInitialData
}

export function useInbox(options: UseInboxOptions = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Inbox settings (human mode timeout)
  const { humanModeTimeoutHours } = useInboxSettings()

  // State for filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | null>(null)
  const [modeFilter, setModeFilter] = useState<ConversationMode | null>(null)
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
  // Filtros do bloco "abas por botão de template": template selecionado + botão clicado.
  const [templateFilter, setTemplateFilter] = useState<string | null>(null)
  const [buttonFilter, setButtonFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // Selected conversation ID (from URL or state)
  const [selectedId, setSelectedId] = useState<string | null>(
    options.initialConversationId || null
  )

  // Sync with URL params
  useEffect(() => {
    const urlConversationId = searchParams.get('c')
    if (urlConversationId && urlConversationId !== selectedId) {
      setSelectedId(urlConversationId)
    }
  }, [searchParams])

  // Conversations list
  const {
    conversations,
    total,
    totalPages,
    totalUnread,
    isLoading: isLoadingConversations,
    hasNextPage,
    // Filtros de botão/template costumam render listas amplas (78+ no welcome).
    // Sem paginação ainda, sobe o limite quando algum desses está ativo.
  } = useConversations({
    page,
    limit: buttonFilter || templateFilter ? 100 : undefined,
    // Quando o filtro de botão/template está ativo, ignoramos modo/status/label
    // para sempre mostrar TODOS os matches do servidor — esses filtros são de
    // intenção explícita ("ver quem clicou X"), e qualquer outro filtro
    // antigo persistido no estado iria cortar a lista.
    status: buttonFilter || templateFilter ? undefined : statusFilter ?? undefined,
    mode: buttonFilter || templateFilter ? undefined : modeFilter ?? undefined,
    labelId: buttonFilter || templateFilter ? undefined : labelFilter ?? undefined,
    search: search || undefined,
    buttonPayload: buttonFilter ?? undefined,
    templateName: templateFilter ?? undefined,
    initialData: options.initialData?.conversations,
  })

  // Conversation mutations
  const conversationMutations = useConversationMutations()

  // Selected conversation with messages
  const {
    conversation: selectedConversation,
    isLoadingConversation: isLoadingSelectedConversation,
    updateConversation,
    messages,
    isLoadingMessages,
    isLoadingMore: isLoadingMoreMessages,
    hasMoreMessages,
    sendMessage,
    isSending,
    loadMoreMessages,
  } = useConversationWithMessages(selectedId)

  // Labels
  const { labels, isLoading: isLoadingLabels } = useLabels({
    initialData: options.initialData?.labels,
  })

  // Quick Replies
  const { quickReplies, isLoading: isLoadingQuickReplies, refetch: refetchQuickReplies } = useQuickReplies({
    initialData: options.initialData?.quickReplies,
  })

  // ==========================================================================
  // AI Agent Edit Modal State
  // ==========================================================================
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null)
  const [isLoadingAgent, setIsLoadingAgent] = useState(false)
  const [isSavingAgent, setIsSavingAgent] = useState(false)

  // Open agent edit modal - fetches full agent data
  const handleOpenAgentEditor = useCallback(async () => {
    const agentId = selectedConversation?.ai_agent_id
    if (!agentId) return

    setIsLoadingAgent(true)
    setIsAgentModalOpen(true)

    try {
      const agent = await aiAgentService.get(agentId)
      setEditingAgent(agent)
    } catch (error) {
      console.error('Failed to load agent:', error)
      setIsAgentModalOpen(false)
    } finally {
      setIsLoadingAgent(false)
    }
  }, [selectedConversation?.ai_agent_id])

  // Close agent edit modal
  const handleCloseAgentEditor = useCallback(() => {
    setIsAgentModalOpen(false)
    setEditingAgent(null)
  }, [])

  // Save agent changes
  const handleSaveAgent = useCallback(
    async (params: UpdateAIAgentParams) => {
      if (!editingAgent) return

      setIsSavingAgent(true)
      try {
        await aiAgentService.update(editingAgent.id, params)
        // Invalidate conversations to refresh agent name
        queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
        handleCloseAgentEditor()
      } catch (error) {
        console.error('Failed to save agent:', error)
        throw error
      } finally {
        setIsSavingAgent(false)
      }
    },
    [editingAgent, queryClient, handleCloseAgentEditor]
  )

  // Select conversation and update URL
  const handleSelectConversation = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      if (id) {
        // Update URL without full navigation
        const url = new URL(window.location.href)
        url.searchParams.set('c', id)
        router.replace(url.pathname + url.search, { scroll: false })
      } else {
        const url = new URL(window.location.href)
        url.searchParams.delete('c')
        router.replace(url.pathname + url.search, { scroll: false })
      }
    },
    [router]
  )

  // Handle sending a message
  // Auto-transfers to human mode when operator sends a manual message
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!selectedId) return

      // Auto-transfer to human mode if currently in bot mode
      // This prevents bot from responding on top of manual responses
      if (selectedConversation?.mode === 'bot') {
        await conversationMutations.switchMode({ id: selectedId, mode: 'human' })
      }

      await sendMessage({ content, message_type: 'text' })
    },
    [selectedId, sendMessage, selectedConversation?.mode, conversationMutations]
  )

  // Toggle mode (bot <-> human) with configured timeout
  const handleModeToggle = useCallback(async () => {
    if (!selectedConversation) return
    const newMode: ConversationMode =
      selectedConversation.mode === 'bot' ? 'human' : 'bot'
    const timeoutMs = getHumanModeTimeoutMs(humanModeTimeoutHours)
    await conversationMutations.switchMode({
      id: selectedConversation.id,
      mode: newMode,
      timeoutMs,
    })
  }, [selectedConversation, conversationMutations, humanModeTimeoutHours])

  // Close conversation
  const handleCloseConversation = useCallback(async () => {
    if (!selectedConversation) return
    await conversationMutations.close(selectedConversation.id)
  }, [selectedConversation, conversationMutations])

  // Reopen conversation
  const handleReopenConversation = useCallback(async () => {
    if (!selectedConversation) return
    await conversationMutations.reopen(selectedConversation.id)
  }, [selectedConversation, conversationMutations])

  // Change priority
  const handlePriorityChange = useCallback(
    async (priority: ConversationPriority) => {
      if (!selectedConversation) return
      await updateConversation({ priority })
    },
    [selectedConversation, updateConversation]
  )

  // Toggle label
  const handleLabelToggle = useCallback(
    async (labelId: string) => {
      if (!selectedConversation) return
      const currentLabels = selectedConversation.labels?.map((l) => l.id) || []
      const hasLabel = currentLabels.includes(labelId)
      const newLabels = hasLabel
        ? currentLabels.filter((id) => id !== labelId)
        : [...currentLabels, labelId]
      await updateConversation({ labels: newLabels })
    },
    [selectedConversation, updateConversation]
  )

  // T050: Handoff to human
  const handleHandoff = useCallback(
    async (params?: { reason?: string; summary?: string; pauseMinutes?: number }) => {
      if (!selectedConversation) return
      await conversationMutations.handoff({ id: selectedConversation.id, ...params })
    },
    [selectedConversation, conversationMutations]
  )

  // T050: Return to bot
  const handleReturnToBot = useCallback(async () => {
    if (!selectedConversation) return
    await conversationMutations.returnToBot(selectedConversation.id)
  }, [selectedConversation, conversationMutations])

  // Delete conversation
  const handleDeleteConversation = useCallback(async () => {
    if (!selectedConversation) return
    await conversationMutations.deleteConversation(selectedConversation.id)
    // Clear selection after deletion
    handleSelectConversation(null)
  }, [selectedConversation, conversationMutations, handleSelectConversation])

  return {
    // Conversations
    conversations,
    total,
    totalPages,
    totalUnread,
    isLoadingConversations,
    page,
    setPage,
    hasNextPage,

    // Selected conversation
    selectedConversationId: selectedId,
    onSelectConversation: handleSelectConversation,
    selectedConversation: selectedConversation ?? null,
    isLoadingSelectedConversation,

    // Messages
    messages,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    onLoadMoreMessages: loadMoreMessages,
    onSendMessage: handleSendMessage,
    isSending,

    // Labels
    labels,
    isLoadingLabels,

    // Quick Replies
    quickReplies,
    quickRepliesLoading: isLoadingQuickReplies,
    refetchQuickReplies,

    // Filters
    search,
    onSearchChange: setSearch,
    statusFilter,
    onStatusFilterChange: setStatusFilter,
    modeFilter,
    onModeFilterChange: setModeFilter,
    labelFilter,
    onLabelFilterChange: setLabelFilter,
    buttonFilter,
    onButtonFilterChange: setButtonFilter,
    templateFilter,
    onTemplateFilterChange: setTemplateFilter,

    // Conversation actions
    onModeToggle: handleModeToggle,
    onCloseConversation: handleCloseConversation,
    onReopenConversation: handleReopenConversation,
    onPriorityChange: handlePriorityChange,
    onLabelToggle: handleLabelToggle,
    // T050: Handoff actions
    onHandoff: handleHandoff,
    onReturnToBot: handleReturnToBot,
    // Delete conversation
    onDeleteConversation: handleDeleteConversation,
    isUpdatingConversation:
      conversationMutations.isUpdating ||
      conversationMutations.isSwitchingMode ||
      conversationMutations.isClosing ||
      conversationMutations.isReopening,
    isHandingOff: conversationMutations.isHandingOff,
    isReturningToBot: conversationMutations.isReturningToBot,
    isDeletingConversation: conversationMutations.isDeleting,

    // AI Agent editing
    isAgentModalOpen,
    editingAgent,
    isLoadingAgent,
    isSavingAgent,
    onOpenAgentEditor: handleOpenAgentEditor,
    onCloseAgentEditor: handleCloseAgentEditor,
    onSaveAgent: handleSaveAgent,
  }
}
