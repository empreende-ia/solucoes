import { NextRequest, NextResponse } from 'next/server'
import { contactDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

/**
 * GET /api/contacts/stats
 * Get contact statistics
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const stats = await contactDb.getStats()
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      }
    })
  } catch (error) {
    console.error('Failed to fetch contact stats:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar estatísticas', details: (error as Error).message },
      { status: 500 }
    )
  }
}
