/**
 * T023, T024: GET/POST /api/inbox/conversations/[id]/messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listMessages, sendMessage } from '@/lib/inbox/inbox-service'
import { getPrincipal, requireAttendantPermission } from '@/lib/principal'

// Regex para ISO 8601 datetime com precisão variável (Supabase pode retornar 1-6 dígitos)
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

const querySchema = z.object({
  before: z.string().regex(ISO_DATETIME_REGEX, 'Invalid ISO datetime').optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
})

const postSchema = z.object({
  content: z.string().min(1).max(4096),
  message_type: z.enum(['text', 'template']).default('text'),
  template_name: z.string().optional(),
  template_params: z.record(z.string(), z.array(z.string())).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  // Dono ou atendente com canView
  const denied = requireAttendantPermission(request, 'canView')
  if (denied) return denied

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse({
      before: searchParams.get('before') || undefined,
      limit: searchParams.get('limit') || 50,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await listMessages(id, {
      before: parsed.data.before,
      limit: parsed.data.limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[GET /api/inbox/conversations/[id]/messages]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  // Dono ou atendente com canReply
  const denied = requireAttendantPermission(request, 'canReply')
  if (denied) return denied

  try {
    const { id } = await params
    const body = await request.json()

    const parsed = postSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { content, message_type, template_name, template_params } = parsed.data

    // A PWA de atendente só envia texto livre; template (pago) fica restrito ao dono
    if (
      getPrincipal(request)?.kind === 'attendant' &&
      (message_type !== 'text' || template_name !== undefined || template_params !== undefined)
    ) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Atendente só pode enviar mensagens de texto' },
        { status: 403 }
      )
    }

    // Validate template requirements
    if (message_type === 'template' && !template_name) {
      return NextResponse.json(
        { error: 'template_name is required when message_type is template' },
        { status: 400 }
      )
    }

    const message = await sendMessage(
      id,
      content,
      message_type,
      template_name,
      template_params
    )

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error('[POST /api/inbox/conversations/[id]/messages]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
