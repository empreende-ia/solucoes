import { NextRequest, NextResponse } from 'next/server'
import { opportunityDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** GET /api/opportunities?pipelineId=pl_x — oportunidades do pipeline */
export async function GET(request: Request) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  try {
    const url = new URL(request.url)
    const pipelineId = url.searchParams.get('pipelineId') || ''
    if (!pipelineId) {
      return NextResponse.json({ error: 'pipelineId é obrigatório' }, { status: 400 })
    }
    const opportunities = await opportunityDb.listByPipeline(pipelineId)
    return NextResponse.json(opportunities, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('Failed to fetch opportunities:', error)
    return NextResponse.json({ error: 'Falha ao buscar oportunidades' }, { status: 500 })
  }
}

/** POST /api/opportunities — cria oportunidade */
export async function POST(request: Request) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  try {
    const body = await request.json().catch(() => ({}))
    const pipelineId = String(body?.pipelineId ?? '').trim()
    const stageId = String(body?.stageId ?? '').trim()
    const name = String(body?.name ?? '').trim()
    if (!pipelineId || !stageId || !name) {
      return NextResponse.json(
        { error: 'pipelineId, stageId e name são obrigatórios' },
        { status: 400 }
      )
    }
    const valueRaw = Number(body?.value)
    const opportunity = await opportunityDb.create({
      pipelineId,
      stageId,
      name,
      contactId: typeof body?.contactId === 'string' ? body.contactId : null,
      phone: typeof body?.phone === 'string' ? body.phone : null,
      value: Number.isFinite(valueRaw) ? valueRaw : null,
      status: ['open', 'won', 'lost', 'abandoned'].includes(body?.status)
        ? body.status
        : 'open',
      source: 'manual',
    })
    return NextResponse.json(opportunity, { status: 201 })
  } catch (error) {
    console.error('Failed to create opportunity:', error)
    return NextResponse.json({ error: 'Falha ao criar oportunidade' }, { status: 500 })
  }
}
