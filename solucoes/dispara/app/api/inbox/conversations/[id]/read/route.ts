/**
 * T025: POST /api/inbox/conversations/[id]/read - Mark conversation as read
 */

import { NextRequest, NextResponse } from 'next/server'
import { markAsRead } from '@/lib/inbox/inbox-service'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params

    await markAsRead(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/inbox/conversations/[id]/read]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
