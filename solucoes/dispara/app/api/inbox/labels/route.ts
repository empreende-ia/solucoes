/**
 * T026: GET/POST /api/inbox/labels - List and create labels
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listLabels, createNewLabel } from '@/lib/inbox/inbox-service'

const postSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#6B7280'),
})

export async function GET() {
  try {
    const labels = await listLabels()
    return NextResponse.json(labels)
  } catch (error) {
    console.error('[GET /api/inbox/labels]', error)
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

    const label = await createNewLabel(parsed.data)

    return NextResponse.json(label, { status: 201 })
  } catch (error) {
    console.error('[POST /api/inbox/labels]', error)

    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('duplicate')) {
      return NextResponse.json(
        { error: 'Label with this name already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
