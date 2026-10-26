/**
 * T055: AI Agent Service - API client for AI agent operations
 * CRUD operations for AI agents configuration
 */

import type { AIAgent } from '@/types'

// =============================================================================
// Types
// =============================================================================

import type { EmbeddingProvider, RerankProvider } from '@/types'

export interface CreateAIAgentParams {
  name: string
  system_prompt: string
  model?: string
  temperature?: number
  max_tokens?: number
  is_active?: boolean
  is_default?: boolean
  debounce_ms?: number
  // RAG: Embedding config
  embedding_provider?: EmbeddingProvider
  embedding_model?: string
  embedding_dimensions?: number
  // RAG: Reranking config
  rerank_enabled?: boolean
  rerank_provider?: RerankProvider | null
  rerank_model?: string | null
  rerank_top_k?: number
  // RAG: Search config
  rag_similarity_threshold?: number
  rag_max_results?: number
  // Handoff config
  handoff_enabled?: boolean
  handoff_instructions?: string | null
  // Booking tool config
  booking_tool_enabled?: boolean
  // Tool permissions
  allow_reactions?: boolean
  allow_quotes?: boolean
}

export interface UpdateAIAgentParams {
  name?: string
  system_prompt?: string
  model?: string
  temperature?: number
  max_tokens?: number
  is_active?: boolean
  is_default?: boolean
  debounce_ms?: number
  // RAG: Embedding config
  embedding_provider?: EmbeddingProvider
  embedding_model?: string
  embedding_dimensions?: number
  // RAG: Reranking config
  rerank_enabled?: boolean
  rerank_provider?: RerankProvider | null
  rerank_model?: string | null
  rerank_top_k?: number
  // RAG: Search config
  rag_similarity_threshold?: number
  rag_max_results?: number
  // Handoff config
  handoff_enabled?: boolean
  handoff_instructions?: string | null
  // Booking tool config
  booking_tool_enabled?: boolean
  // Tool permissions
  allow_reactions?: boolean
  allow_quotes?: boolean
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * List all AI agents
 */
async function listAgents(): Promise<AIAgent[]> {
  const response = await fetch('/api/ai-agents')
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch AI agents' }))
    throw new Error(error.error || 'Failed to fetch AI agents')
  }
  return response.json()
}

/**
 * Get a single AI agent by ID
 */
async function getAgent(id: string): Promise<AIAgent> {
  const response = await fetch(`/api/ai-agents/${id}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch AI agent' }))
    throw new Error(error.error || 'Failed to fetch AI agent')
  }
  return response.json()
}

/**
 * Create a new AI agent
 */
async function createAgent(params: CreateAIAgentParams): Promise<AIAgent> {
  const response = await fetch('/api/ai-agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create AI agent' }))
    throw new Error(error.error || 'Failed to create AI agent')
  }
  return response.json()
}

/**
 * Update an AI agent
 */
async function updateAgent(id: string, params: UpdateAIAgentParams): Promise<AIAgent> {
  const response = await fetch(`/api/ai-agents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update AI agent' }))
    throw new Error(error.error || 'Failed to update AI agent')
  }
  return response.json()
}

/**
 * Delete an AI agent
 */
async function deleteAgent(id: string): Promise<{ success: boolean; deleted: string }> {
  const response = await fetch(`/api/ai-agents/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete AI agent' }))
    throw new Error(error.error || 'Failed to delete AI agent')
  }
  return response.json()
}

/**
 * Set an agent as the default
 */
async function setDefaultAgent(id: string): Promise<AIAgent> {
  return updateAgent(id, { is_default: true })
}

/**
 * Toggle agent active status
 */
async function toggleAgentActive(id: string, isActive: boolean): Promise<AIAgent> {
  return updateAgent(id, { is_active: isActive })
}

// =============================================================================
// Export Service
// =============================================================================

export const aiAgentService = {
  list: listAgents,
  get: getAgent,
  create: createAgent,
  update: updateAgent,
  delete: deleteAgent,
  setDefault: setDefaultAgent,
  toggleActive: toggleAgentActive,
}
