/**
 * AI Test Endpoint
 *
 * Permite testar a IA diretamente sem enviar mensagens via WhatsApp.
 * Ideal para:
 * - Testes automatizados de qualidade das respostas
 * - Validação de agentes antes de ativar
 * - Debugging de comportamento da IA
 *
 * IMPORTANTE: Este endpoint requer autenticação via API key (DISPARA_API_KEY)
 */

import { NextRequest, NextResponse } from 'next/server'
import { processChatAgent } from '@/lib/ai/agents/chat-agent'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ContactStatus, type AIAgent, type InboxConversation, type InboxMessage } from '@/types'

// Timeout de 2 minutos (suficiente para testes)
export const maxDuration = 120

export const dynamic = 'force-dynamic'

// =============================================================================
// Types
// =============================================================================

interface AITestRequest {
  /** Mensagem a ser processada pela IA */
  message: string

  /** ID do agente a usar (opcional - usa default se não informado) */
  agentId?: string

  /** Histórico de conversa anterior (opcional) */
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>

  /** Telefone simulado (para contexto) */
  phone?: string

  /** Nome do contato simulado (para contexto) */
  contactName?: string
}

interface AITestResponse {
  success: boolean
  response?: {
    message: string
    sentiment: string
    confidence: number
    shouldHandoff: boolean
    handoffReason?: string
    handoffSummary?: string
    sources?: Array<{ title: string; content: string }>
  }
  error?: string
  latencyMs: number
  agentUsed: {
    id: string
    name: string
    model: string
  }
}

// =============================================================================
// Auth Helper
// =============================================================================

function validateApiKey(req: NextRequest): boolean {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
  const validKey = process.env.DISPARA_API_KEY

  if (!validKey) {
    console.warn('[AI-TEST] DISPARA_API_KEY not configured')
    return false
  }

  return apiKey === validKey
}

// =============================================================================
// POST Handler
// =============================================================================

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  console.log(`🧪 [AI-TEST] ========================================`)
  console.log(`🧪 [AI-TEST] Test request received at ${new Date().toISOString()}`)

  // 1. Valida API key
  if (!validateApiKey(req)) {
    console.log(`❌ [AI-TEST] Unauthorized - invalid or missing API key`)
    return NextResponse.json(
      { error: 'Unauthorized - provide valid API key in x-api-key header' },
      { status: 401 }
    )
  }

  try {
    // 2. Parse request
    const body = (await req.json()) as AITestRequest
    const {
      message,
      agentId,
      conversationHistory = [],
      phone = '+5511999999999',
      contactName = 'Test User',
    } = body

    if (!message) {
      return NextResponse.json({ error: 'Missing "message" field' }, { status: 400 })
    }

    console.log(`🧪 [AI-TEST] Message: "${message.slice(0, 100)}..."`)
    console.log(`🧪 [AI-TEST] Agent ID: ${agentId || 'default'}`)
    console.log(`🧪 [AI-TEST] History length: ${conversationHistory.length}`)

    // 3. Busca agente
    const agent = await getAgent(agentId)

    if (!agent) {
      return NextResponse.json(
        { error: agentId ? `Agent not found: ${agentId}` : 'No default agent configured' },
        { status: 404 }
      )
    }

    console.log(`🧪 [AI-TEST] Using agent: ${agent.name} (${agent.model})`)

    // 4. Monta conversa mock
    const mockConversation: InboxConversation = {
      id: 'test-conversation-' + Date.now(),
      phone,
      mode: 'bot',
      ai_agent_id: agent.id,
      unread_count: 0,
      automation_paused_until: null,
      automation_paused_by: null,
      contact_id: null,
      status: 'open',
      priority: 'normal',
      total_messages: 0,
      last_message_at: new Date().toISOString(),
      last_message_preview: null,
      handoff_summary: null,
      human_mode_expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Campo virtual para teste
      contact: contactName ? { id: 'test-contact', phone, name: contactName, status: ContactStatus.OPT_IN, tags: [], lastActive: new Date().toISOString() } : undefined,
    }

    // 5. Monta mensagens mock
    const mockMessages: InboxMessage[] = []

    // Adiciona histórico
    for (let i = 0; i < conversationHistory.length; i++) {
      const msg = conversationHistory[i]
      mockMessages.push({
        id: `test-msg-${i}`,
        conversation_id: mockConversation.id,
        direction: msg.role === 'user' ? 'inbound' : 'outbound',
        content: msg.content,
        message_type: 'text',
        media_url: null,
        whatsapp_message_id: null,
        delivery_status: 'delivered',
        ai_response_id: null,
        ai_sentiment: null,
        ai_sources: null,
        payload: null,
        source_type: 'text',
        button_payload: null,
        created_at: new Date(Date.now() - (conversationHistory.length - i) * 60000).toISOString(),
      })
    }

    // Adiciona mensagem atual
    mockMessages.push({
      id: `test-msg-current`,
      conversation_id: mockConversation.id,
      direction: 'inbound',
      content: message,
      message_type: 'text',
      media_url: null,
      whatsapp_message_id: null,
      delivery_status: 'delivered',
      ai_response_id: null,
      ai_sentiment: null,
      ai_sources: null,
      payload: null,
      source_type: 'text',
      button_payload: null,
      created_at: new Date().toISOString(),
    })

    // 6. Processa com IA
    console.log(`🧪 [AI-TEST] Calling processChatAgent...`)

    const result = await processChatAgent({
      agent,
      conversation: mockConversation,
      messages: mockMessages,
    })

    const latencyMs = Date.now() - startTime

    console.log(`🧪 [AI-TEST] Result: success=${result.success}, latency=${latencyMs}ms`)

    // 7. Monta resposta
    const response: AITestResponse = {
      success: result.success,
      latencyMs,
      agentUsed: {
        id: agent.id,
        name: agent.name,
        model: agent.model || 'default',
      },
    }

    if (result.success && result.response) {
      response.response = {
        message: result.response.message,
        sentiment: result.response.sentiment,
        confidence: result.response.confidence,
        shouldHandoff: result.response.shouldHandoff || false,
        handoffReason: result.response.handoffReason,
        handoffSummary: result.response.handoffSummary,
        sources: result.response.sources,
      }
    } else {
      response.error = result.error
    }

    console.log(`🧪 [AI-TEST] ========================================`)
    console.log(`🧪 [AI-TEST] COMPLETED in ${latencyMs}ms`)
    if (result.response) {
      console.log(`🧪 [AI-TEST] Response: "${result.response.message.slice(0, 100)}..."`)
      console.log(`🧪 [AI-TEST] Sentiment: ${result.response.sentiment}`)
      console.log(`🧪 [AI-TEST] Handoff: ${result.response.shouldHandoff}`)
    }
    console.log(`🧪 [AI-TEST] ========================================`)

    return NextResponse.json(response)
  } catch (error) {
    const latencyMs = Date.now() - startTime

    console.error(`💥 [AI-TEST] Exception after ${latencyMs}ms:`, error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
        latencyMs,
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// Helpers
// =============================================================================

async function getAgent(agentId?: string): Promise<AIAgent | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null

  if (agentId) {
    const { data } = await supabase.from('ai_agents').select('*').eq('id', agentId).single()
    return data as AIAgent | null
  }

  // Busca agente padrão
  const { data } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('is_active', true)
    .eq('is_default', true)
    .single()

  return data as AIAgent | null
}
