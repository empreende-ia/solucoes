/**
 * T029: useConversation - Single conversation with messages
 * Provides conversation details and message operations with real-time updates
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import {
  inboxService,
  type SendMessageParams,
  type UpdateConversationParams,
} from '@/services/inboxService'
import type { InboxConversation, InboxMessage, ConversationMode } from '@/types'
import { CACHE, REALTIME } from '@/lib/constants'
import { createRealtimeInvalidator } from '@/lib/realtime-invalidation'
import { REALTIME_FILTERS } from '@/lib/realtime-db-change'
import { useRealtimeQuery } from './useRealtimeQuery'
import {
  createRealtimeChannel,
  subscribeToTable,
  activateChannel,
  removeChannel,
} from '@/lib/supabase-realtime'

const CONVERSATION_KEY = 'inbox-conversation'
const MESSAGES_KEY = 'inbox-messages'

// Query key builders
export const getConversationQueryKey = (id: string) => [CONVERSATION_KEY, id]
export const getMessagesQueryKey = (conversationId: string) => [MESSAGES_KEY, conversationId]

// =============================================================================
// Conversation Detail Hook
// =============================================================================

export function useConversation(conversationId: string | null) {
  const queryClient = useQueryClient()

  // Conversation query with real-time updates
  const conversationQuery = useRealtimeQuery<InboxConversation | null>({
    queryKey: getConversationQueryKey(conversationId || ''),
    queryFn: async () => {
      if (!conversationId) return null
      return inboxService.getConversation(conversationId)
    },
    enabled: !!conversationId,
    staleTime: CACHE.inbox,
    // Stop retrying if conversation not found (404)
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('404')) return false
      return failureCount < 3
    },
    // Real-time
    table: 'inbox_conversations',
    events: ['UPDATE'],
    filter: conversationId ? REALTIME_FILTERS.conversationById(conversationId) : undefined,
    debounceMs: REALTIME.debounceDefault,
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (params: UpdateConversationParams) =>
      inboxService.updateConversation(conversationId!, params),
    onSuccess: (updated) => {
      queryClient.setQueryData(getConversationQueryKey(conversationId!), updated)
      // Also invalidate list
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
    },
  })

  // Mark as read
  const markAsReadMutation = useMutation({
    mutationFn: () => inboxService.markAsRead(conversationId!),
    onMutate: async () => {
      // Optimistic update
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(conversationId!),
        (old) => (old ? { ...old, unread_count: 0 } : old)
      )
    },
  })

  // T068: Pause automation
  const pauseMutation = useMutation({
    mutationFn: (params: { duration_minutes: number; reason?: string }) =>
      inboxService.pauseAutomation(conversationId!, params.duration_minutes, params.reason),
    onMutate: async (params) => {
      // Optimistic update
      const pauseUntil = new Date(Date.now() + params.duration_minutes * 60 * 1000).toISOString()
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(conversationId!),
        (old) =>
          old
            ? {
                ...old,
                automation_paused_until: pauseUntil,
                automation_paused_by: params.reason || 'manual',
              }
            : old
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
    },
    onError: () => {
      // Revert on error
      queryClient.invalidateQueries({ queryKey: getConversationQueryKey(conversationId!) })
    },
  })

  // T068: Resume automation
  const resumeMutation = useMutation({
    mutationFn: () => inboxService.resumeAutomation(conversationId!),
    onMutate: async () => {
      // Optimistic update
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(conversationId!),
        (old) =>
          old
            ? {
                ...old,
                automation_paused_until: null,
                automation_paused_by: null,
              }
            : old
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
    },
    onError: () => {
      // Revert on error
      queryClient.invalidateQueries({ queryKey: getConversationQueryKey(conversationId!) })
    },
  })

  // Auto mark as read when conversation is loaded
  useEffect(() => {
    if (conversationQuery.data?.unread_count && conversationQuery.data.unread_count > 0) {
      markAsReadMutation.mutate()
    }
  }, [conversationId, conversationQuery.data?.unread_count])

  return {
    conversation: conversationQuery.data,
    isLoading: conversationQuery.isLoading,
    error: conversationQuery.error,

    update: updateMutation.mutateAsync,
    markAsRead: markAsReadMutation.mutateAsync,

    // T068: Pause/Resume automation
    pause: pauseMutation.mutateAsync,
    resume: resumeMutation.mutateAsync,

    isUpdating: updateMutation.isPending,
    isMarkingAsRead: markAsReadMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
  }
}

// =============================================================================
// Messages Hook
// =============================================================================

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient()
  const [isSending, setIsSending] = useState(false)
  const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(null)

  // Messages query with infinite scroll
  const messagesQuery = useInfiniteQuery({
    queryKey: getMessagesQueryKey(conversationId || ''),
    queryFn: async ({ pageParam }) => {
      if (!conversationId) return { messages: [], hasMore: false }
      return inboxService.listMessages(conversationId, {
        before: pageParam,
        limit: 50,
      })
    },
    enabled: !!conversationId,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined
      // Get the oldest message timestamp for cursor-based pagination
      const oldestMessage = lastPage.messages[0]
      return oldestMessage?.created_at
    },
    initialPageParam: undefined as string | undefined,
    staleTime: CACHE.inbox,
    refetchOnWindowFocus: false,
  })

  // Realtime subscription for new messages
  useEffect(() => {
    if (!conversationId) return

    // Create channel for this conversation's messages
    const channelName = `inbox-messages-${conversationId}-${Date.now()}`
    const channel = createRealtimeChannel(channelName)

    if (!channel) {
      console.warn('[useMessages] Supabase not configured, skipping realtime')
      return
    }

    channelRef.current = channel

    // O canal `dispara-db` é público (qualquer um emite nele): o evento é só um SINAL.
    // Nova mensagem (INSERT) e mudança de status de entrega (UPDATE) invalidam a lista
    // e o status real vem da API autenticada — nunca do payload (um UPDATE forjado com
    // delivery_status 'read' mostraria "lida" numa mensagem que o contato não leu).
    // O invalidador limita a taxa (debounce + maxWait) e não cancela o fetch em curso.
    const invalidator = createRealtimeInvalidator(queryClient, { waitMs: REALTIME.debounceDefault })
    const invalidateMessages = () => {
      invalidator.invalidate(getMessagesQueryKey(conversationId))
    }

    // Subscribe to INSERT events (new messages) — filtro por conversa no hub
    subscribeToTable(channel, 'inbox_messages', 'INSERT', invalidateMessages, REALTIME_FILTERS.messagesByConversation(conversationId))

    // Also subscribe to UPDATE events (delivery status changes)
    subscribeToTable(channel, 'inbox_messages', 'UPDATE', invalidateMessages, REALTIME_FILTERS.messagesByConversation(conversationId))

    // Activate the channel
    activateChannel(channel).catch((err) => {
      console.error('[useMessages] Failed to subscribe to inbox_messages:', err)
    })

    // Cleanup on unmount or conversationId change
    return () => {
      invalidator.cancel()
      if (channelRef.current) {
        removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [conversationId, queryClient])

  // Flatten messages from all pages
  // IMPORTANT: Reverse pages order because newer pages are added at the end by React Query,
  // but they contain OLDER messages (loaded via "before" cursor for backward pagination).
  // Without reverse: [recent msgs] + [older msgs] = wrong chronological order
  // With reverse: [older msgs] + [recent msgs] = correct chronological order
  const messages: InboxMessage[] =
    messagesQuery.data?.pages.slice().reverse().flatMap((page) => page.messages) ?? []

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (params: SendMessageParams) =>
      inboxService.sendMessage(conversationId!, params),
    onMutate: async (params) => {
      setIsSending(true)

      // Optimistic update - add pending message
      const optimisticMessage: InboxMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId!,
        direction: 'outbound',
        content: params.content,
        message_type: params.message_type || 'text',
        delivery_status: 'pending',
        created_at: new Date().toISOString(),
        // Optional fields
        media_url: null,
        whatsapp_message_id: null,
        ai_response_id: null,
        ai_sentiment: null,
        ai_sources: null,
        payload: null,
        source_type: 'text',
        button_payload: null,
      }

      queryClient.setQueryData(
        getMessagesQueryKey(conversationId!),
        (old: typeof messagesQuery.data) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page, index) =>
              index === old.pages.length - 1
                ? { ...page, messages: [...page.messages, optimisticMessage] }
                : page
            ),
          }
        }
      )

      return { optimisticMessage }
    },
    onSuccess: (newMessage, _, context) => {
      setIsSending(false)

      // Replace optimistic message with real one
      queryClient.setQueryData(
        getMessagesQueryKey(conversationId!),
        (old: typeof messagesQuery.data) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page, index) =>
              index === old.pages.length - 1
                ? {
                    ...page,
                    messages: page.messages.map((m) =>
                      m.id === context?.optimisticMessage.id ? newMessage : m
                    ),
                  }
                : page
            ),
          }
        }
      )
    },
    onError: (_, __, context) => {
      setIsSending(false)

      // Remove optimistic message on error
      queryClient.setQueryData(
        getMessagesQueryKey(conversationId!),
        (old: typeof messagesQuery.data) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page, index) =>
              index === old.pages.length - 1
                ? {
                    ...page,
                    messages: page.messages.filter(
                      (m) => m.id !== context?.optimisticMessage.id
                    ),
                  }
                : page
            ),
          }
        }
      )
    },
  })

  // Load more (older messages)
  // React Query garante que fetchNextPage é estável
  const loadMore = useCallback(() => {
    if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      messagesQuery.fetchNextPage()
    }
  }, [messagesQuery.hasNextPage, messagesQuery.isFetchingNextPage, messagesQuery.fetchNextPage])

  // Refetch to get new messages
  // React Query garante que refetch é estável
  const refresh = useCallback(() => {
    messagesQuery.refetch()
  }, [messagesQuery.refetch])

  return {
    messages,
    isLoading: messagesQuery.isLoading,
    isLoadingMore: messagesQuery.isFetchingNextPage,
    hasMore: messagesQuery.hasNextPage ?? false,
    error: messagesQuery.error,

    send: sendMutation.mutateAsync,
    isSending,

    loadMore,
    refresh,
  }
}

// =============================================================================
// Combined Hook for convenience
// =============================================================================

export function useConversationWithMessages(conversationId: string | null) {
  const conversation = useConversation(conversationId)
  const messages = useMessages(conversationId)

  return {
    // Conversation
    conversation: conversation.conversation,
    isLoadingConversation: conversation.isLoading,
    conversationError: conversation.error,
    updateConversation: conversation.update,
    markAsRead: conversation.markAsRead,

    // T068: Pause/Resume automation
    pauseAutomation: conversation.pause,
    resumeAutomation: conversation.resume,
    isPausing: conversation.isPausing,
    isResuming: conversation.isResuming,

    // Messages
    messages: messages.messages,
    isLoadingMessages: messages.isLoading,
    isLoadingMore: messages.isLoadingMore,
    hasMoreMessages: messages.hasMore,
    messagesError: messages.error,

    sendMessage: messages.send,
    isSending: messages.isSending,

    loadMoreMessages: messages.loadMore,
    refreshMessages: messages.refresh,
  }
}
