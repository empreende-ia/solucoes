import { NextRequest, NextResponse } from 'next/server'
import { contactDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/contacts/ids
 * Lista IDs de contatos (com filtros opcionais)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireSessionOrApiKey(request as NextRequest)
    if (auth) return auth

    const url = new URL(request.url)
    const search = url.searchParams.get('search') || ''
    const status = url.searchParams.get('status') || ''
    const tag = url.searchParams.get('tag') || ''
    // multi-tag (paridade GHL): ?tags=a,b,c&tagMatch=any|all
    const tagsParam = url.searchParams.get('tags') || ''
    const tags = tagsParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const tagMatch = url.searchParams.get('tagMatch') === 'all' ? 'all' : 'any'

    const ids = await contactDb.getIds({ search, status, tag, tags, tagMatch })
    return NextResponse.json(ids, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('Failed to fetch contact ids:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar IDs de contatos' },
      { status: 500 }
    )
  }
}
