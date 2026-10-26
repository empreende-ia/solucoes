/**
 * PUT/DELETE /api/inbox/quick-replies/[id] - Update and delete quick replies
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { updateExistingQuickReply, removeQuickReply } from '@/lib/inbox/inbox-service'

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(4096).optional(),
  shortcut: z.string().max(20).nullable().optional().transform(val => val ?? undefined),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()

    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Ensure at least one field is being updated
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const quickReply = await updateExistingQuickReply(id, parsed.data)

    if (!quickReply) {
      return NextResponse.json(
        { error: 'Quick reply not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(quickReply)
  } catch (error) {
    console.error('[PUT /api/inbox/quick-replies/[id]]', error)

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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    await removeQuickReply(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/inbox/quick-replies/[id]]', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
