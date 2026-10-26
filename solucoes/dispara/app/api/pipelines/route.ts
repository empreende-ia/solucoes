import { NextRequest, NextResponse } from 'next/server'
import { pipelineDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** GET /api/pipelines — pipelines com etapas ordenadas */
export async function GET(request: Request) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  try {
    const pipelines = await pipelineDb.getAll()
    return NextResponse.json(pipelines, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('Failed to fetch pipelines:', error)
    return NextResponse.json({ error: 'Falha ao buscar pipelines' }, { status: 500 })
  }
}

/** POST /api/pipelines — cria pipeline { name, stageNames? } */
export async function POST(request: Request) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Nome do pipeline é obrigatório' }, { status: 400 })
    }
    const stageNames = Array.isArray(body?.stageNames)
      ? body.stageNames.map((s: unknown) => String(s).trim()).filter(Boolean)
      : undefined
    const pipeline = await pipelineDb.create({ name, stageNames })
    return NextResponse.json(pipeline, { status: 201 })
  } catch (error) {
    console.error('Failed to create pipeline:', error)
    return NextResponse.json({ error: 'Falha ao criar pipeline' }, { status: 500 })
  }
}
