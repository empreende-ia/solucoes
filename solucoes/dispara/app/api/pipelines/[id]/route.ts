import { NextRequest, NextResponse } from 'next/server'
import { pipelineDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

/** PATCH /api/pipelines/[id] — renomeia o pipeline */
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }
    await pipelineDb.rename(id, name)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to rename pipeline:', error)
    return NextResponse.json({ error: 'Falha ao renomear pipeline' }, { status: 500 })
  }
}

/** DELETE /api/pipelines/[id] — apaga o pipeline (etapas/oportunidades em cascata) */
export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  const { id } = await params
  try {
    await pipelineDb.delete(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete pipeline:', error)
    return NextResponse.json({ error: 'Falha ao excluir pipeline' }, { status: 500 })
  }
}
