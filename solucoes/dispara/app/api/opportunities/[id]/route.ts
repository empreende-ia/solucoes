import { NextRequest, NextResponse } from 'next/server'
import { opportunityDb, type Opportunity } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

const VALID_STATUSES = new Set(['open', 'won', 'lost', 'abandoned'])

/** PATCH /api/opportunities/[id] — move de etapa / muda status / edita */
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const patch: Parameters<typeof opportunityDb.update>[1] = {}
    if (typeof body?.stageId === 'string' && body.stageId.trim()) {
      patch.stageId = body.stageId.trim()
    }
    if (typeof body?.status === 'string' && VALID_STATUSES.has(body.status)) {
      patch.status = body.status as Opportunity['status']
    }
    if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim()
    if (body?.value !== undefined) {
      const valueRaw = Number(body.value)
      patch.value = Number.isFinite(valueRaw) ? valueRaw : null
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }
    const opportunity = await opportunityDb.update(id, patch)
    return NextResponse.json(opportunity)
  } catch (error) {
    console.error('Failed to update opportunity:', error)
    return NextResponse.json({ error: 'Falha ao atualizar oportunidade' }, { status: 500 })
  }
}

/** DELETE /api/opportunities/[id] */
export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  const { id } = await params
  try {
    await opportunityDb.delete(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete opportunity:', error)
    return NextResponse.json({ error: 'Falha ao excluir oportunidade' }, { status: 500 })
  }
}
