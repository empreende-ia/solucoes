import { NextResponse } from 'next/server'
import { campaignDb } from '@/lib/supabase-db'

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/campaigns/[id]/clone
 * Alias for "duplicate": clone a campaign as a DRAFT.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params

    const cloned = await campaignDb.duplicate(id)
    if (!cloned) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    }

    return NextResponse.json(cloned, {
      status: 201,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error) {
    console.error('Failed to clone campaign:', error)
    return NextResponse.json(
      { error: 'Falha ao clonar campanha', details: (error as Error).message },
      { status: 500 }
    )
  }
}
