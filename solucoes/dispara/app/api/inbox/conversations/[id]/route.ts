/**
 * T021, T022: GET/PATCH/DELETE /api/inbox/conversations/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getConversation, patchConversation, deleteConversation } from '@/lib/inbox/inbox-service'
import { OWNER_KINDS, requireAttendantPermission, requirePrincipal } from '@/lib/principal'

const patchSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  mode: z.enum(['bot', 'human']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  ai_agent_id: z.string().uuid().optional(),
  labels: z.array(z.string().uuid()).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  // Dono ou atendente com canView (PWA /atendimento)
  const denied = requireAttendantPermission(request, 'canView')
  if (denied) return denied

  try {
    const { id } = await params

    const conversation = await getConversation(id)

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('[GET /api/inbox/conversations/[id]]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  // Alterar status/modo/labels/agente: só o dono (atendente usa takeover/return-to-bot)
  const denied = requirePrincipal(request, OWNER_KINDS)
  if (denied) return denied

  try {
    const { id } = await params
    const body = await request.json()

    const parsed = patchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const conversation = await patchConversation(id, parsed.data)

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('[PATCH /api/inbox/conversations/[id]]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  // Apagar conversa: só o dono
  const denied = requirePrincipal(request, OWNER_KINDS)
  if (denied) return denied

  try {
    const { id } = await params

    await deleteConversation(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/inbox/conversations/[id]]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
