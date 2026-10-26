/**
 * GET/PATCH/DELETE /api/campaigns/folders/[id] - Get, update and delete campaign folder
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { campaignFolderDb } from '@/lib/supabase-db'

const patchSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const folder = await campaignFolderDb.getById(id)

    if (!folder) {
      return NextResponse.json(
        { error: 'Pasta não encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json(folder)
  } catch (error) {
    console.error('[GET /api/campaigns/folders/[id]]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
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

    // Verifica se a pasta existe
    const existing = await campaignFolderDb.getById(id)
    if (!existing) {
      return NextResponse.json(
        { error: 'Pasta não encontrada' },
        { status: 404 }
      )
    }

    const folder = await campaignFolderDb.update(id, parsed.data)

    return NextResponse.json(folder)
  } catch (error) {
    console.error('[PATCH /api/campaigns/folders/[id]]', error)

    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('duplicate')) {
      return NextResponse.json(
        { error: 'Já existe uma pasta com este nome' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // Verifica se a pasta existe
    const existing = await campaignFolderDb.getById(id)
    if (!existing) {
      return NextResponse.json(
        { error: 'Pasta não encontrada' },
        { status: 404 }
      )
    }

    await campaignFolderDb.delete(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/campaigns/folders/[id]]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
