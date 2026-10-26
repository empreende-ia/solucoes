/**
 * T027: GET/POST /api/inbox/quick-replies - List and create quick replies
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listQuickReplies, createNewQuickReply } from '@/lib/inbox/inbox-service'

const postSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(4096),
  shortcut: z.string().max(20).optional(),
})

export async function GET() {
  try {
    const quickReplies = await listQuickReplies()
    return NextResponse.json(quickReplies)
  } catch (error) {
    console.error('[GET /api/inbox/quick-replies]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const parsed = postSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const quickReply = await createNewQuickReply(parsed.data)

    return NextResponse.json(quickReply, { status: 201 })
  } catch (error) {
    console.error('[POST /api/inbox/quick-replies]', error)

    // Handle unique constraint violation for shortcut
    if (error instanceof Error && error.message.includes('duplicate')) {
      return NextResponse.json(
        { error: 'Quick reply with this shortcut already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
