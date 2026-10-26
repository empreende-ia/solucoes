'use client'

import dynamic from 'next/dynamic'
import { InboxView } from '@/components/features/inbox'
import { useInbox } from '@/hooks/useInbox'
import type { InboxInitialData } from './actions'

// Dynamic import para modal pesado (~885 linhas) - só carrega quando abre
const AIAgentForm = dynamic(
  () => import('@/components/features/settings/ai-agents').then(m => m.AIAgentForm),
  { ssr: false }
)

interface InboxClientWrapperProps {
  initialData?: InboxInitialData
  initialConversationId?: string
}

export function InboxClientWrapper({ initialData, initialConversationId }: InboxClientWrapperProps) {
  const inbox = useInbox({
    initialConversationId,
    initialData: initialData ? {
      conversations: initialData.conversations,
      labels: initialData.labels,
      quickReplies: initialData.quickReplies,
      totalUnread: initialData.totalUnread,
    } : undefined,
  })

  return (
    <>
      <InboxView
        // Conversations
        conversations={inbox.conversations}
        isLoadingConversations={inbox.isLoadingConversations && !initialData}
        totalUnread={inbox.totalUnread}
        // Selected conversation
        selectedConversationId={inbox.selectedConversationId}
        onSelectConversation={inbox.onSelectConversation}
        selectedConversation={inbox.selectedConversation}
        isLoadingSelectedConversation={inbox.isLoadingSelectedConversation}
        // Messages
        messages={inbox.messages}
        isLoadingMessages={inbox.isLoadingMessages}
        isLoadingMoreMessages={inbox.isLoadingMoreMessages}
        hasMoreMessages={inbox.hasMoreMessages}
        onLoadMoreMessages={inbox.onLoadMoreMessages}
        onSendMessage={inbox.onSendMessage}
        isSending={inbox.isSending}
        // Labels
        labels={inbox.labels}
        // Quick Replies
        quickReplies={inbox.quickReplies}
        quickRepliesLoading={inbox.quickRepliesLoading}
        onRefreshQuickReplies={inbox.refetchQuickReplies}
        // Filters
        search={inbox.search}
        onSearchChange={inbox.onSearchChange}
        statusFilter={inbox.statusFilter}
        onStatusFilterChange={inbox.onStatusFilterChange}
        modeFilter={inbox.modeFilter}
        onModeFilterChange={inbox.onModeFilterChange}
        labelFilter={inbox.labelFilter}
        onLabelFilterChange={inbox.onLabelFilterChange}
        buttonFilter={inbox.buttonFilter}
        onButtonFilterChange={inbox.onButtonFilterChange}
        templateFilter={inbox.templateFilter}
        onTemplateFilterChange={inbox.onTemplateFilterChange}
        // Conversation actions
        onModeToggle={inbox.onModeToggle}
        onCloseConversation={inbox.onCloseConversation}
        onReopenConversation={inbox.onReopenConversation}
        onPriorityChange={inbox.onPriorityChange}
        onLabelToggle={inbox.onLabelToggle}
        // T050: Handoff actions
        onHandoff={inbox.onHandoff}
        onReturnToBot={inbox.onReturnToBot}
        // Delete conversation
        onDeleteConversation={inbox.onDeleteConversation}
        // Configure AI agent
        onConfigureAgent={inbox.onOpenAgentEditor}
        isUpdatingConversation={inbox.isUpdatingConversation}
        isHandingOff={inbox.isHandingOff}
        isReturningToBot={inbox.isReturningToBot}
        isDeletingConversation={inbox.isDeletingConversation}
      />

      {/* AI Agent Edit Modal */}
      <AIAgentForm
        open={inbox.isAgentModalOpen}
        onOpenChange={(open) => !open && inbox.onCloseAgentEditor()}
        agent={inbox.editingAgent}
        onSubmit={inbox.onSaveAgent}
        isSubmitting={inbox.isSavingAgent}
      />
    </>
  )
}
