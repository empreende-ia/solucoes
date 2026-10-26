/**
 * T054: AI Agent API - Single Agent Operations
 * GET /api/ai-agents/[id] - Get single agent
 * PATCH /api/ai-agents/[id] - Update agent
 * DELETE /api/ai-agents/[id] - Delete agent
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase'

// Helper to get admin client with null check
function getClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured. Check SUPABASE_SECRET_KEY env var.')
  }
  return client
}

// Update agent schema (all fields optional)
const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  system_prompt: z.string().min(10).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(100).max(8192).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  debounce_ms: z.number().int().min(0).max(30000).optional(),
  // RAG: Embedding config
  embedding_provider: z.enum(['google', 'openai', 'voyage', 'cohere']).optional(),
  embedding_model: z.string().optional(),
  embedding_dimensions: z.number().int().min(256).max(2000).optional(),
  // RAG: Reranking config
  rerank_enabled: z.boolean().optional(),
  rerank_provider: z.enum(['cohere', 'together']).nullable().optional(),
  rerank_model: z.string().nullable().optional(),
  rerank_top_k: z.number().int().min(1).max(20).optional(),
  // RAG: Search config
  rag_similarity_threshold: z.number().min(0).max(1).optional(),
  rag_max_results: z.number().int().min(1).max(20).optional(),
  // Handoff config
  handoff_enabled: z.boolean().optional(),
  handoff_instructions: z.string().nullable().optional(),
  // Booking tool config
  booking_tool_enabled: z.boolean().optional(),
  // Tool permissions
  allow_reactions: z.boolean().optional(),
  allow_quotes: z.boolean().optional(),
})

/**
 * GET /api/ai-agents/[id]
 * Get a single AI agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getClient()

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !agent) {
      return NextResponse.json(
        { error: 'AI agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(agent)
  } catch (error) {
    console.error('[AI Agents] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/ai-agents/[id]
 * Update an AI agent
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getClient()

    // Validate agent exists
    const { data: existing, error: fetchError } = await supabase
      .from('ai_agents')
      .select('id, is_default')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'AI agent not found' },
        { status: 404 }
      )
    }

    // Parse request body
    const body = await request.json()
    const parsed = updateAgentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data

    // If setting as default, unset other defaults first
    if (data.is_default && !existing.is_default) {
      await supabase
        .from('ai_agents')
        .update({ is_default: false })
        .eq('is_default', true)
    }

    // Update agent
    const { data: agent, error: updateError } = await supabase
      .from('ai_agents')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[AI Agents] Failed to update agent:', updateError)
      return NextResponse.json(
        { error: 'Failed to update AI agent' },
        { status: 500 }
      )
    }

    return NextResponse.json(agent)
  } catch (error) {
    console.error('[AI Agents] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ai-agents/[id]
 * Delete an AI agent
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getClient()

    // Check if agent exists and if it's the default
    const { data: existing, error: fetchError } = await supabase
      .from('ai_agents')
      .select('id, is_default, name')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'AI agent not found' },
        { status: 404 }
      )
    }

    // Prevent deleting the default agent
    if (existing.is_default) {
      return NextResponse.json(
        { error: 'Não é possível excluir o agente padrão. Defina outro agente como padrão primeiro.' },
        { status: 400 }
      )
    }

    // Check if agent is assigned to any conversations
    const { count: assignedCount } = await supabase
      .from('inbox_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('ai_agent_id', id)

    // If agent has conversations, switch them to human mode and remove assignment
    if (assignedCount && assignedCount > 0) {
      const { error: updateError } = await supabase
        .from('inbox_conversations')
        .update({
          ai_agent_id: null,
          mode: 'human',
        })
        .eq('ai_agent_id', id)

      if (updateError) {
        console.error('[AI Agents] Failed to update conversations:', updateError)
        return NextResponse.json(
          { error: 'Falha ao atualizar conversas do agente' },
          { status: 500 }
        )
      }

      console.log(`[AI Agents] Switched ${assignedCount} conversations to human mode before deleting agent ${existing.name}`)
    }

    // Delete agent
    const { error: deleteError } = await supabase
      .from('ai_agents')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[AI Agents] Failed to delete agent:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete AI agent' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, deleted: existing.name })
  } catch (error) {
    console.error('[AI Agents] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
