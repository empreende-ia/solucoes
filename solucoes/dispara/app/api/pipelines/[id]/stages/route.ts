import { NextRequest, NextResponse } from 'next/server'
import { pipelineDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

/** POST /api/pipelines/[id]/stages — adiciona etapa { name } */
export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Nome da etapa é obrigatório' }, { status: 400 })
    }
    const stage = await pipelineDb.addStage(id, name)
    return NextResponse.json(stage, { status: 201 })
  } catch (error) {
    console.error('Failed to add stage:', error)
    return NextResponse.json({ error: 'Falha ao adicionar etapa' }, { status: 500 })
  }
}

/** PATCH /api/pipelines/[id]/stages — renomeia etapa { stageId, name } */
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  await params
  try {
    const body = await request.json().catch(() => ({}))
    const stageId = String(body?.stageId ?? '').trim()
    const name = String(body?.name ?? '').trim()
    if (!stageId || !name) {
      return NextResponse.json({ error: 'stageId e name são obrigatórios' }, { status: 400 })
    }
    await pipelineDb.renameStage(stageId, name)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to rename stage:', error)
    return NextResponse.json({ error: 'Falha ao renomear etapa' }, { status: 500 })
  }
}

/** DELETE /api/pipelines/[id]/stages — remove etapa { stageId } */
export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  await params
  try {
    const body = await request.json().catch(() => ({}))
    const stageId = String(body?.stageId ?? '').trim()
    if (!stageId) {
      return NextResponse.json({ error: 'stageId é obrigatório' }, { status: 400 })
    }
    await pipelineDb.deleteStage(stageId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete stage:', error)
    return NextResponse.json({ error: 'Falha ao excluir etapa' }, { status: 500 })
  }
}
