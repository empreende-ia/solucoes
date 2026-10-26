import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/submissions
 * Lista todas as submissões de Flows com filtros opcionais
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const search = url.searchParams.get('search') || ''
    const campaignId = url.searchParams.get('campaignId') || ''
    const flowId = url.searchParams.get('flowId') || ''

    const limit = Math.max(1, Math.min(100, Number(limitParam) || 20))
    const offset = Math.max(0, Number(offsetParam) || 0)

    // Query base com JOINs para trazer dados relacionados
    // Supabase PostgREST permite foreign key embeds automaticamente
    let query = supabase
      .from('flow_submissions')
      .select(
        `
        *,
        contact:contacts(id, name, phone, email),
        campaign:campaigns(id, name)
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })

    // Filtro por campanha
    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }

    // Filtro por flow (meta_flow_id no flow_token)
    if (flowId) {
      query = query.ilike('flow_token', `%${flowId}%`)
    }

    // Busca por telefone
    if (search) {
      query = query.ilike('from_phone', `%${search}%`)
    }

    // Paginação
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        data: data || [],
        total: count || 0,
        limit,
        offset,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar submissões'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
