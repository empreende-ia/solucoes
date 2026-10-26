/**
 * T065: Resume Automation endpoint
 * Immediately resumes AI automation for a conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    // Clear pause fields
    const { data: conversation, error } = await supabase
      .from('inbox_conversations')
      .update({
        automation_paused_until: null,
        automation_paused_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[resume] Database error:', error)

      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Conversa não encontrada' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { error: 'Erro ao resumir automação' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      conversation,
      message: 'Automação resumida com sucesso',
    })
  } catch (error) {
    console.error('[resume] Error:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
