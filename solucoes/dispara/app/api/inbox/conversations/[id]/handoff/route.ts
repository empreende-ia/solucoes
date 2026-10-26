/**
 * T050: Handoff API Endpoint
 * Allows manual transfer of conversation from bot to human
 * POST /api/inbox/conversations/[id]/handoff
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase'
import { cancelDebounce } from '@/lib/ai/agents/chat-agent'
import type { ConversationMode } from '@/types'

// Request body schema
const handoffSchema = z.object({
  /** Reason for handoff (optional) */
  reason: z.string().optional(),
  /** Summary of conversation for the human agent (optional) */
  summary: z.string().optional(),
  /** Duration to pause automation in minutes (default: 60) */
  pauseMinutes: z.number().int().min(0).max(1440).default(60),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
    }

    // Validate conversation exists
    const { data: conversation, error: fetchError } = await supabase
      .from('inbox_conversations')
      .select('id, mode, phone, status')
      .eq('id', id)
      .single()

    if (fetchError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const parsed = handoffSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { reason, summary, pauseMinutes } = parsed.data

    // Check if already in human mode
    if (conversation.mode === 'human') {
      return NextResponse.json(
        { error: 'Conversation is already in human mode' },
        { status: 400 }
      )
    }

    // Cancel any pending AI debounce
    cancelDebounce(id)

    // Calculate pause end time
    const pauseUntil = pauseMinutes > 0
      ? new Date(Date.now() + pauseMinutes * 60 * 1000).toISOString()
      : null

    // Update conversation
    const updateData: Record<string, unknown> = {
      mode: 'human' as ConversationMode,
      automation_paused_until: pauseUntil,
      automation_paused_by: 'manual_handoff',
    }

    // Store handoff summary if provided
    if (summary) {
      updateData.handoff_summary = summary
    }

    const { data: updated, error: updateError } = await supabase
      .from('inbox_conversations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[Handoff] Failed to update conversation:', updateError)
      return NextResponse.json(
        { error: 'Failed to handoff conversation' },
        { status: 500 }
      )
    }

    // Create internal note about handoff
    await supabase.from('inbox_messages').insert({
      conversation_id: id,
      direction: 'outbound',
      content: `🔄 **Transferência manual para atendente**${reason ? `\n\n**Motivo:** ${reason}` : ''}${summary ? `\n\n**Resumo:** ${summary}` : ''}${pauseMinutes > 0 ? `\n\n⏸️ Automação pausada por ${pauseMinutes} minutos` : ''}`,
      message_type: 'internal_note',
      delivery_status: 'delivered',
      payload: {
        type: 'manual_handoff',
        reason,
        summary,
        pauseMinutes,
        pauseUntil,
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      conversation: updated,
      message: `Conversa transferida para atendimento humano${pauseMinutes > 0 ? `. Automação pausada por ${pauseMinutes} minutos.` : '.'}`,
    })
  } catch (error) {
    console.error('[Handoff] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/inbox/conversations/[id]/handoff
 * Return conversation to bot mode (end handoff)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
    }

    // Validate conversation exists
    const { data: conversation, error: fetchError } = await supabase
      .from('inbox_conversations')
      .select('id, mode')
      .eq('id', id)
      .single()

    if (fetchError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Check if in human mode
    if (conversation.mode === 'bot') {
      return NextResponse.json(
        { error: 'Conversation is already in bot mode' },
        { status: 400 }
      )
    }

    // Update conversation back to bot mode
    const { data: updated, error: updateError } = await supabase
      .from('inbox_conversations')
      .update({
        mode: 'bot' as ConversationMode,
        automation_paused_until: null,
        automation_paused_by: null,
        handoff_summary: null,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[Handoff] Failed to return to bot:', updateError)
      return NextResponse.json(
        { error: 'Failed to return conversation to bot' },
        { status: 500 }
      )
    }

    // Create internal note
    await supabase.from('inbox_messages').insert({
      conversation_id: id,
      direction: 'outbound',
      content: '🤖 **Atendimento retornado para o bot**\n\nA automação foi reativada.',
      message_type: 'internal_note',
      delivery_status: 'delivered',
      payload: {
        type: 'handoff_ended',
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      conversation: updated,
      message: 'Conversa retornada para atendimento automático.',
    })
  } catch (error) {
    console.error('[Handoff] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
