/**
 * Return to Bot endpoint - Devolve conversa para IA
 * Muda mode para 'bot' e permite que automação continue
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAttendantPermission } from '@/lib/principal'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  // Dono ou atendente com canReply E canHandoff (a UI exige os dois)
  const denied =
    requireAttendantPermission(request, 'canReply') ??
    requireAttendantPermission(request, 'canHandoff')
  if (denied) return denied

  try {
    const { id } = await context.params
    // Service role (como o takeover): o client anon não tem UPDATE em inbox_conversations
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
    }

    // Atualizar conversa para modo bot
    const { data: conversation, error } = await supabase
      .from('inbox_conversations')
      .update({
        mode: 'bot',
        automation_paused_until: null,
        automation_paused_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[return-to-bot] Database error:', error)

      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Conversa não encontrada' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { error: 'Erro ao devolver para IA' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      conversation,
      message: 'Conversa devolvida para IA',
    })
  } catch (error) {
    console.error('[return-to-bot] Error:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
