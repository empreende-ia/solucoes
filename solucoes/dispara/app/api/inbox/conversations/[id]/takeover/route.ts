/**
 * Takeover endpoint - Atendente assume a conversa
 * Muda mode para 'human' e limpa pausa de automação
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAttendantPermission } from '@/lib/principal'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  // Dono ou atendente com canReply (assumir = passar a responder)
  const denied = requireAttendantPermission(request, 'canReply')
  if (denied) return denied

  try {
    const { id } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
    }

    // Atualizar conversa para modo humano
    const { data: conversation, error } = await supabase
      .from('inbox_conversations')
      .update({
        mode: 'human',
        priority: 'normal', // Volta para prioridade normal
        automation_paused_until: null,
        automation_paused_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[takeover] Database error:', error)

      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Conversa não encontrada' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { error: 'Erro ao assumir conversa' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      conversation,
      message: 'Conversa assumida com sucesso',
    })
  } catch (error) {
    console.error('[takeover] Error:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
