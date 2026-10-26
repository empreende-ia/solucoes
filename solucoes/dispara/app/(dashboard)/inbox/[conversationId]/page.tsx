'use client'

/**
 * T041: Inbox/[conversationId] Page - Deep linking to specific conversation
 * URL param → conversation selection
 */

import { Suspense, use } from 'react'
import dynamic from 'next/dynamic'
import { InboxView } from '@/components/features/inbox'
import { useInbox } from '@/hooks/useInbox'
import { Loader2 } from 'lucide-react'

// Dynamic import para modal pesado (~885 linhas) - só carrega quando abre
const AIAgentForm = dynamic(
  () => import('@/components/features/settings/ai-agents').then(m => m.AIAgentForm),
  { ssr: false }
)

interface InboxConversationPageProps {
  params: Promise<{ conversationId: string }>
}

function InboxConversationPageContent({ conversationId }: { conversationId: string }) {
  const inbox = useInbox({ initialConversationId: conversationId })

  return (
    <>
      <InboxView
        // Conversations
        conversations={inbox.conversations}
        isLoadingConversations={inbox.isLoadingConversations}
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

function LoadingFallback() {
  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-[var(--ds-bg-base)]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        <p className="text-sm text-[var(--ds-text-muted)]">Carregando conversa...</p>
      </div>
    </div>
  )
}

export default function InboxConversationPage({ params }: InboxConversationPageProps) {
  const { conversationId } = use(params)

  return (
    <Suspense fallback={<LoadingFallback />}>
      <InboxConversationPageContent conversationId={conversationId} />
    </Suspense>
  )
}
