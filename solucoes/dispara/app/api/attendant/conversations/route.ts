/**
 * API para Atendimento - Conversas
 *
 * Retorna conversas no formato otimizado para a página de atendimento.
 * Mapeia InboxConversation → AttendantConversation
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAttendantPermission } from '@/lib/principal'
import type { InboxConversation, Contact } from '@/types'

// =============================================================================
// TIPOS
// =============================================================================

export type AttendantConversationStatus = 'ai_active' | 'human_active' | 'handoff_requested' | 'resolved'

export interface AttendantConversation {
  id: string
  contactName: string
  contactPhone: string
  contactAvatar?: string
  status: AttendantConversationStatus
  lastMessage: string
  lastMessageAt: string // ISO string para serialização
  unreadCount: number
  isTyping?: boolean
  aiAgentName?: string
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Mapeia status do inbox para status do atendimento
 */
function mapStatus(conversation: InboxConversation): AttendantConversationStatus {
  // Conversa fechada = resolvida
  if (conversation.status === 'closed') {
    return 'resolved'
  }

  // Se tem priority urgent e está no modo bot, provavelmente pediu handoff
  if (conversation.priority === 'urgent' && conversation.mode === 'bot') {
    return 'handoff_requested'
  }

  // Se tem handoff_summary, também pediu handoff
  if (conversation.handoff_summary && conversation.mode === 'bot') {
    return 'handoff_requested'
  }

  // Mapeia modo diretamente
  if (conversation.mode === 'human') {
    return 'human_active'
  }

  return 'ai_active'
}

/**
 * Transforma InboxConversation em AttendantConversation
 */
function transformConversation(
  conv: InboxConversation & { contact?: Contact | null }
): AttendantConversation {
  return {
    id: conv.id,
    contactName: conv.contact?.name || formatPhoneForDisplay(conv.phone),
    contactPhone: conv.phone,
    contactAvatar: undefined, // Contatos não têm avatar no momento
    status: mapStatus(conv),
    lastMessage: conv.last_message_preview || 'Sem mensagens',
    lastMessageAt: conv.last_message_at || conv.created_at,
    unreadCount: conv.unread_count,
    aiAgentName: conv.ai_agent?.name,
  }
}

/**
 * Formata telefone para exibição
 */
function formatPhoneForDisplay(phone: string): string {
  // Remove o + e formata como (XX) XXXXX-XXXX
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 13) {
    // +55 11 99999-9999
    return `(${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`
  }
  return phone
}

// =============================================================================
// GET - Lista conversas para o atendimento
// =============================================================================

export async function GET(request: Request) {
  // Dono passa sempre; atendente só com canView
  const denied = requireAttendantPermission(request, 'canView')
  if (denied) return denied

  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'open' | 'closed' | null (all)
    const search = searchParams.get('search')
    const button = searchParams.get('button')
    const template = searchParams.get('template')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Filtro por clique de botão: conversas com pelo menos uma mensagem inbound
    // com source_type='button_reply' e button_payload casando.
    let buttonConversationIds: string[] | null = null
    if (button && button.trim()) {
      const { data: msgs, error: msgErr } = await supabase
        .from('inbox_messages')
        .select('conversation_id')
        .eq('source_type', 'button_reply')
        .eq('button_payload', button.trim())
      if (msgErr) {
        console.error('[attendant-api] button filter query error:', msgErr.message)
        return NextResponse.json({ error: msgErr.message }, { status: 500 })
      }
      buttonConversationIds = Array.from(
        new Set((msgs || []).map((m) => m.conversation_id as string))
      )
    }

    // Filtro por template recebido: conversas com pelo menos uma outbound
    // do tipo template com payload->>'template_name' casando.
    let templateConversationIds: string[] | null = null
    if (template && template.trim()) {
      const { data: msgs, error: msgErr } = await supabase
        .from('inbox_messages')
        .select('conversation_id')
        .eq('direction', 'outbound')
        .eq('message_type', 'template')
        .eq('payload->>template_name', template.trim())
      if (msgErr) {
        console.error('[attendant-api] template filter query error:', msgErr.message)
        return NextResponse.json({ error: msgErr.message }, { status: 500 })
      }
      templateConversationIds = Array.from(
        new Set((msgs || []).map((m) => m.conversation_id as string))
      )
    }

    let combinedIds: string[] | null = null
    if (buttonConversationIds && templateConversationIds) {
      const tplSet = new Set(templateConversationIds)
      combinedIds = buttonConversationIds.filter((id) => tplSet.has(id))
    } else {
      combinedIds = buttonConversationIds || templateConversationIds
    }

    if (combinedIds && combinedIds.length === 0) {
      return NextResponse.json({
        conversations: [],
        counts: { total: 0, urgent: 0, ai: 0, human: 0, resolved: 0 },
      })
    }

    // Query base
    let query = supabase
      .from('inbox_conversations')
      .select(`
        *,
        contact:contacts(*),
        ai_agent:ai_agents(id, name)
      `)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (combinedIds) {
      query = query.in('id', combinedIds)
    }

    // Filtro por status
    if (status === 'open') {
      query = query.eq('status', 'open')
    } else if (status === 'closed') {
      query = query.eq('status', 'closed')
    }

    // Filtro por busca (nome do contato ou telefone)
    if (search) {
      query = query.or(`phone.ilike.%${search}%,contact.name.ilike.%${search}%`)
    }

    const { data: conversations, error } = await query

    if (error) {
      console.error('[attendant-api] Error fetching conversations:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transformar para formato do atendimento
    const attendantConversations = (conversations || []).map(transformConversation)

    // Calcular contadores
    const counts = {
      total: attendantConversations.length,
      urgent: attendantConversations.filter(c => c.status === 'handoff_requested').length,
      ai: attendantConversations.filter(c => c.status === 'ai_active').length,
      human: attendantConversations.filter(c => c.status === 'human_active').length,
      resolved: attendantConversations.filter(c => c.status === 'resolved').length,
    }

    return NextResponse.json({
      conversations: attendantConversations,
      counts,
    })

  } catch (error) {
    console.error('[attendant-api] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
