/**
 * T020: GET /api/inbox/conversations - List conversations with filters
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listConversations } from '@/lib/inbox/inbox-service'
import type { ConversationStatus, ConversationMode } from '@/types'

const querySchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  mode: z.enum(['bot', 'human']).optional(),
  label: z.string().uuid().optional(),
  search: z.string().optional(),
  button: z.string().min(1).max(100).optional(),
  template: z.string().min(1).max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse({
      status: searchParams.get('status') || undefined,
      mode: searchParams.get('mode') || undefined,
      label: searchParams.get('label') || undefined,
      search: searchParams.get('search') || undefined,
      button: searchParams.get('button') || undefined,
      template: searchParams.get('template') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 20,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await listConversations({
      status: parsed.data.status as ConversationStatus | undefined,
      mode: parsed.data.mode as ConversationMode | undefined,
      labelId: parsed.data.label,
      search: parsed.data.search,
      buttonPayload: parsed.data.button,
      templateName: parsed.data.template,
      page: parsed.data.page,
      limit: parsed.data.limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[GET /api/inbox/conversations]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
