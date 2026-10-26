'use client'

/**
 * MessagePanel - Seamless Chat Area
 *
 * Design Philosophy:
 * - Unified background with message container
 * - Floating scroll-to-bottom button
 * - Minimal chrome, maximum content
 * - Header blends into content area
 */

import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MessageBubble } from './MessageBubble'
import { MessageInput } from './MessageInput'
import { ConversationHeader } from './ConversationHeader'
import type {
  InboxConversation,
  InboxMessage,
  InboxLabel,
  InboxQuickReply,
  ConversationMode,
  ConversationPriority,
} from '@/types'

export interface MessagePanelProps {
  conversation: InboxConversation | null
  messages: InboxMessage[]
  labels: InboxLabel[]
  quickReplies: InboxQuickReply[]

  // Loading states
  isLoadingConversation: boolean
  isLoadingMessages: boolean
  isLoadingMore: boolean
  isSending: boolean
  quickRepliesLoading: boolean
  /** Callback to refresh quick replies after CRUD operations */
  onRefreshQuickReplies?: () => void

  // Pagination
  hasMoreMessages: boolean
  onLoadMore: () => void

  // Actions
  onSendMessage: (content: string) => void
  onModeToggle: () => void
  onClose: () => void
  onReopen: () => void
  onPriorityChange: (priority: ConversationPriority) => void
  onLabelToggle: (labelId: string) => void
  /** T050: Handoff to human agent */
  onHandoff?: (params?: { reason?: string; summary?: string; pauseMinutes?: number }) => void
  /** T050: Return to bot mode */
  onReturnToBot?: () => void
  /** Delete conversation */
  onDelete?: () => void
  /** Configure AI agent */
  onConfigureAgent?: () => void
  isUpdating?: boolean
  isHandingOff?: boolean
  isReturningToBot?: boolean
  isDeleting?: boolean
}

export function MessagePanel({
  conversation,
  messages,
  labels,
  quickReplies,
  isLoadingConversation,
  isLoadingMessages,
  isLoadingMore,
  isSending,
  quickRepliesLoading,
  onRefreshQuickReplies,
  hasMoreMessages,
  onLoadMore,
  onSendMessage,
  onModeToggle,
  onClose,
  onReopen,
  onPriorityChange,
  onLabelToggle,
  onHandoff,
  onReturnToBot,
  onDelete,
  onConfigureAgent,
  isUpdating,
  isHandingOff,
  isReturningToBot,
  isDeleting,
}: MessagePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const prevMessagesLengthRef = useRef(messages.length)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Check if user is at bottom
  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    const threshold = 50
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant',
    })
  }, [])

  // Handle scroll event
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom()
    isAtBottomRef.current = atBottom
    setShowScrollButton(!atBottom && messages.length > 5)

    // Load more when scrolled to top
    const el = scrollRef.current
    if (el && el.scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
      onLoadMore()
    }
  }, [checkIfAtBottom, hasMoreMessages, isLoadingMore, onLoadMore, messages.length])

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      // New message added
      if (isAtBottomRef.current) {
        scrollToBottom()
      }
    }
    prevMessagesLengthRef.current = messages.length
  }, [messages.length, scrollToBottom])

  // Initial scroll to bottom
  useEffect(() => {
    if (conversation && messages.length > 0) {
      scrollToBottom(false)
    }
  }, [conversation?.id])

  // No conversation selected
  if (!conversation && !isLoadingConversation) {
    return (
      <div className="flex flex-col h-full bg-[var(--ds-bg-base)] items-center justify-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--ds-bg-surface)] flex items-center justify-center mb-4">
          <svg
            className="h-7 w-7 text-[var(--ds-text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <p className="text-sm text-[var(--ds-text-muted)]">
          Selecione uma conversa
        </p>
      </div>
    )
  }

  // Loading state
  if (isLoadingConversation) {
    return (
      <div className="flex flex-col h-full bg-[var(--ds-bg-base)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--ds-text-muted)]" />
      </div>
    )
  }

  const isOpen = conversation?.status === 'open'

  return (
    <div className="flex flex-col h-full bg-[var(--ds-bg-base)] relative">
      {/* Header - integrated with content */}
      {conversation && (
        <ConversationHeader
          conversation={conversation}
          labels={labels}
          onModeToggle={onModeToggle}
          onClose={onClose}
          onReopen={onReopen}
          onPriorityChange={onPriorityChange}
          onLabelToggle={onLabelToggle}
          onHandoff={onHandoff}
          onReturnToBot={onReturnToBot}
          onDelete={onDelete}
          onConfigureAgent={onConfigureAgent}
          isUpdating={isUpdating}
          isHandingOff={isHandingOff}
          isReturningToBot={isReturningToBot}
          isDeleting={isDeleting}
        />
      )}

      {/* Messages area - clean scrollable container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 min-w-0"
      >
        {/* Load more indicator */}
        {isLoadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--ds-text-muted)]" />
          </div>
        )}

        {/* Load more button - minimal */}
        {hasMoreMessages && !isLoadingMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={onLoadMore}
              className="text-[10px] text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] transition-colors"
            >
              Carregar anteriores
            </button>
          </div>
        )}

        {/* Messages list */}
        {isLoadingMessages ? (
          <div className="flex flex-col gap-1.5 py-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  'animate-pulse rounded-2xl h-9',
                  i % 2 === 0
                    ? 'self-end w-2/5 bg-[var(--ds-bg-surface)]/40'
                    : 'self-start w-1/2 bg-[var(--ds-bg-surface)]/60'
                )}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-xs text-[var(--ds-text-muted)]">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          <div className="flex flex-col w-full">
            {messages.map((message, index) => {
              // Determine grouping
              const prevMessage = messages[index - 1]
              const nextMessage = messages[index + 1]
              const isFirstInGroup = !prevMessage || prevMessage.direction !== message.direction
              const isLastInGroup = !nextMessage || nextMessage.direction !== message.direction

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  agentName={conversation?.ai_agent?.name}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Scroll to bottom button - floating, minimal */}
      {showScrollButton && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-20 right-4 h-8 w-8 rounded-full bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] flex items-center justify-center text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-all shadow-lg"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      {/* Input area */}
      <MessageInput
        onSend={onSendMessage}
        isSending={isSending}
        disabled={!isOpen}
        placeholder={
          isOpen
            ? 'Mensagem...'
            : 'Conversa fechada'
        }
        quickReplies={quickReplies}
        quickRepliesLoading={quickRepliesLoading}
        onRefreshQuickReplies={onRefreshQuickReplies}
        conversationId={conversation?.id}
        showAISuggest={isOpen && conversation?.mode === 'human'}
      />
    </div>
  )
}
