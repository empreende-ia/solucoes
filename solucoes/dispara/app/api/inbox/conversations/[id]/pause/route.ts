/**
 * T064: Pause Automation endpoint
 * Temporarily pauses AI automation for a conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { z } from 'zod'

const pauseSchema = z.object({
  duration_minutes: z.number().int().min(1).max(1440), // 1 minute to 24 hours
  reason: z.string().max(500).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const body = await request.json()

    // Validate body
    const parsed = pauseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { duration_minutes, reason } = parsed.data

    // Calculate pause until timestamp
    const pauseUntil = new Date(Date.now() + duration_minutes * 60 * 1000).toISOString()

    // Update conversation
    const { data: conversation, error } = await supabase
      .from('inbox_conversations')
      .update({
        automation_paused_until: pauseUntil,
        automation_paused_by: reason || 'manual',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[pause] Database error:', error)

      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Conversa não encontrada' },
          { status: 404 }
        )
      }

      return NextResponse.json(
        { error: 'Erro ao pausar automação' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      conversation,
      paused_until: pauseUntil,
      duration_minutes,
    })
  } catch (error) {
    console.error('[pause] Error:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
