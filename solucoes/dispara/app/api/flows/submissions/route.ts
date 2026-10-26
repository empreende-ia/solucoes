import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { supabase } from '@/lib/supabase'
import { clampInt } from '@/lib/validation-utils'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const anyErr = error as any
    if (typeof anyErr.message === 'string') return anyErr.message
    if (typeof anyErr.error === 'string') return anyErr.error
    if (typeof anyErr.details === 'string' && anyErr.details) return anyErr.details
    if (typeof anyErr.hint === 'string' && anyErr.hint) return anyErr.hint
  }
  return 'Erro desconhecido'
}

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const anyErr = error as any
  const msg = typeof anyErr.message === 'string' ? anyErr.message : ''
  return anyErr.code === 'PGRST205' || /could not find the table/i.test(msg)
}

function isMissingColumn(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false
  const anyErr = error as any
  const msg = typeof anyErr.message === 'string' ? anyErr.message : ''
  return msg.toLowerCase().includes('column') && msg.toLowerCase().includes(column.toLowerCase())
}

/**
 * GET /api/flows/submissions
 * Query params:
 * - flowId
 * - campaignId
 * - phone
 * - limit (default 50, max 200)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const flowId = sp.get('flowId')
    const campaignId = sp.get('campaignId')
    const phone = sp.get('phone')
    const limit = clampInt(sp.get('limit'), 1, 200, 50)

    let q = supabase
      .from('flow_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (flowId) q = q.eq('flow_id', flowId)
    if (campaignId) q = q.eq('campaign_id', campaignId)
    if (phone) q = q.eq('from_phone', phone)

    const { data, error } = await q
    if (error) {
      if (campaignId && isMissingColumn(error, 'campaign_id')) {
        return NextResponse.json([], {
          headers: {
            'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
            'X-Warning': 'flow_submissions_campaign_id_missing',
          },
        })
      }
      throw error
    }

    return NextResponse.json(data || [], {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Failed to fetch flow submissions:', error)

    // Se a tabela não existir (migration não aplicada), não quebra a UI.
    if (isMissingTable(error)) {
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
          'X-Warning': 'flow_submissions_missing',
        },
      })
    }

    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ error: 'Falha ao buscar submissões de MiniApp', details: message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Falha ao buscar submissões de MiniApp' }, { status: 500 })
  }
}
