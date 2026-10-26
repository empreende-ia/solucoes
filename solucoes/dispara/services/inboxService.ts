/**
 * Inbox Service - API client for inbox operations
 * T028-T031: Service layer for conversations, messages, labels, quick replies
 */

import type {
  InboxConversation,
  InboxMessage,
  InboxLabel,
  InboxQuickReply,
  ConversationStatus,
  ConversationMode,
  ConversationPriority,
} from '@/types'

// =============================================================================
// Types
// =============================================================================

export interface ConversationListParams {
  page?: number
  limit?: number
  status?: ConversationStatus
  mode?: ConversationMode
  labelId?: string
  search?: string
  /** Filtra conversas que têm pelo menos uma resposta com botão batendo neste texto. */
  buttonPayload?: string
  /** Filtra conversas que receberam pelo menos uma outbound deste template. */
  templateName?: string
}

export interface ConversationListResult {
  conversations: InboxConversation[]
  total: number
  page: number
  totalPages: number
}

export interface MessageListParams {
  before?: string
  limit?: number
}

export interface MessageListResult {
  messages: InboxMessage[]
  hasMore: boolean
}

export interface SendMessageParams {
  content: string
  message_type?: 'text' | 'template'
  template_name?: string
  template_params?: Record<string, string[]>
}

export interface UpdateConversationParams {
  status?: ConversationStatus
  mode?: ConversationMode
  priority?: ConversationPriority
  ai_agent_id?: string
  labels?: string[]
  /** When human mode should auto-expire (ISO string). Set when switching to human mode. */
  human_mode_expires_at?: string | null
}

export interface CreateLabelParams {
  name: string
  color?: string
}

export interface CreateQuickReplyParams {
  title: string
  content: string
  shortcut?: string
}

// =============================================================================
// Conversation API
// =============================================================================

async function listConversations(params: ConversationListParams = {}): Promise<ConversationListResult> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.status) searchParams.set('status', params.status)
  if (params.mode) searchParams.set('mode', params.mode)
  if (params.labelId) searchParams.set('label_id', params.labelId)
  if (params.search) searchParams.set('search', params.search)
  if (params.buttonPayload) searchParams.set('button', params.buttonPayload)
  if (params.templateName) searchParams.set('template', params.templateName)

  const response = await fetch(`/api/inbox/conversations?${searchParams.toString()}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch conversations' }))
    throw new Error(error.error || 'Failed to fetch conversations')
  }
  return response.json()
}

async function getConversation(id: string): Promise<InboxConversation> {
  const response = await fetch(`/api/inbox/conversations/${id}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch conversation' }))
    throw new Error(`${response.status}: ${error.error || 'Failed to fetch conversation'}`)
  }
  return response.json()
}

async function updateConversation(id: string, params: UpdateConversationParams): Promise<InboxConversation> {
  const response = await fetch(`/api/inbox/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update conversation' }))
    throw new Error(error.error || 'Failed to update conversation')
  }
  return response.json()
}

async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`/api/inbox/conversations/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete conversation' }))
    throw new Error(error.error || 'Failed to delete conversation')
  }
}

async function markAsRead(conversationId: string): Promise<void> {
  const response = await fetch(`/api/inbox/conversations/${conversationId}/read`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to mark as read' }))
    throw new Error(error.error || 'Failed to mark as read')
  }
}

// =============================================================================
// Message API
// =============================================================================

async function listMessages(conversationId: string, params: MessageListParams = {}): Promise<MessageListResult> {
  const searchParams = new URLSearchParams()
  if (params.before) searchParams.set('before', params.before)
  if (params.limit) searchParams.set('limit', String(params.limit))

  const response = await fetch(`/api/inbox/conversations/${conversationId}/messages?${searchParams.toString()}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch messages' }))
    throw new Error(error.error || 'Failed to fetch messages')
  }
  return response.json()
}

async function sendMessage(conversationId: string, params: SendMessageParams): Promise<InboxMessage> {
  const response = await fetch(`/api/inbox/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to send message' }))
    throw new Error(error.error || 'Failed to send message')
  }
  return response.json()
}

// =============================================================================
// Labels API
// =============================================================================

async function listLabels(): Promise<InboxLabel[]> {
  const response = await fetch('/api/inbox/labels')
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch labels' }))
    throw new Error(error.error || 'Failed to fetch labels')
  }
  return response.json()
}

async function createLabel(params: CreateLabelParams): Promise<InboxLabel> {
  const response = await fetch('/api/inbox/labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create label' }))
    throw new Error(error.error || 'Failed to create label')
  }
  return response.json()
}

async function deleteLabel(id: string): Promise<void> {
  const response = await fetch(`/api/inbox/labels/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete label' }))
    throw new Error(error.error || 'Failed to delete label')
  }
}

// =============================================================================
// Quick Replies API
// =============================================================================

async function listQuickReplies(): Promise<InboxQuickReply[]> {
  const response = await fetch('/api/inbox/quick-replies')
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch quick replies' }))
    throw new Error(error.error || 'Failed to fetch quick replies')
  }
  return response.json()
}

async function createQuickReply(params: CreateQuickReplyParams): Promise<InboxQuickReply> {
  const response = await fetch('/api/inbox/quick-replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create quick reply' }))
    throw new Error(error.error || 'Failed to create quick reply')
  }
  return response.json()
}

async function updateQuickReply(id: string, params: Partial<CreateQuickReplyParams>): Promise<InboxQuickReply> {
  const response = await fetch(`/api/inbox/quick-replies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update quick reply' }))
    throw new Error(error.error || 'Failed to update quick reply')
  }
  return response.json()
}

async function deleteQuickReply(id: string): Promise<void> {
  const response = await fetch(`/api/inbox/quick-replies/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete quick reply' }))
    throw new Error(error.error || 'Failed to delete quick reply')
  }
}

// =============================================================================
// T050: Handoff Operations
// =============================================================================

export interface HandoffParams {
  reason?: string
  summary?: string
  pauseMinutes?: number
}

export interface HandoffResult {
  success: boolean
  conversation: InboxConversation
  message: string
}

/**
 * Transfer conversation from bot to human (handoff)
 */
async function handoffToHuman(conversationId: string, params: HandoffParams = {}): Promise<HandoffResult> {
  const response = await fetch(`/api/inbox/conversations/${conversationId}/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to handoff conversation' }))
    throw new Error(error.error || 'Failed to handoff conversation')
  }
  return response.json()
}

/**
 * Return conversation from human to bot (end handoff)
 */
async function returnToBot(conversationId: string): Promise<HandoffResult> {
  const response = await fetch(`/api/inbox/conversations/${conversationId}/handoff`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to return to bot' }))
    throw new Error(error.error || 'Failed to return to bot')
  }
  return response.json()
}

// =============================================================================
// T068: Pause/Resume Automation
// =============================================================================

export interface PauseResult {
  success: boolean
  conversation: InboxConversation
  paused_until: string
  duration_minutes: number
}

export interface ResumeResult {
  success: boolean
  conversation: InboxConversation
  message: string
}

/**
 * Pause automation for a conversation temporarily
 */
async function pauseAutomation(
  conversationId: string,
  durationMinutes: number,
  reason?: string
): Promise<PauseResult> {
  const response = await fetch(`/api/inbox/conversations/${conversationId}/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      duration_minutes: durationMinutes,
      reason,
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to pause automation' }))
    throw new Error(error.error || 'Failed to pause automation')
  }
  return response.json()
}

/**
 * Resume automation for a conversation immediately
 */
async function resumeAutomation(conversationId: string): Promise<ResumeResult> {
  const response = await fetch(`/api/inbox/conversations/${conversationId}/resume`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to resume automation' }))
    throw new Error(error.error || 'Failed to resume automation')
  }
  return response.json()
}

// =============================================================================
// Export Service
// =============================================================================

export const inboxService = {
  // Conversations
  listConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  markAsRead,

  // Messages
  listMessages,
  sendMessage,

  // Labels
  listLabels,
  createLabel,
  deleteLabel,

  // Quick Replies
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,

  // Handoff
  handoffToHuman,
  returnToBot,

  // Pause/Resume
  pauseAutomation,
  resumeAutomation,
}
