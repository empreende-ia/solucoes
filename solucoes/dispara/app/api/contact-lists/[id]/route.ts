import { NextRequest, NextResponse } from 'next/server'
import { contactListDb, type ContactListFilters } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

function sanitizeFilters(raw: unknown): ContactListFilters {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const filters: ContactListFilters = {}
  if (Array.isArray(obj.tags)) {
    filters.tags = obj.tags.map((t) => String(t).trim()).filter(Boolean)
  }
  if (obj.tagMatch === 'all' || obj.tagMatch === 'any') filters.tagMatch = obj.tagMatch
  if (typeof obj.status === 'string' && obj.status.trim()) filters.status = obj.status.trim()
  if (typeof obj.search === 'string' && obj.search.trim()) filters.search = obj.search.trim()
  return filters
}

/** PATCH /api/contact-lists/[id] — renomeia/atualiza filtros */
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const patch: { name?: string; filters?: ContactListFilters } = {}
    if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim()
    if (body?.filters !== undefined) patch.filters = sanitizeFilters(body.filters)
    const list = await contactListDb.update(id, patch)
    return NextResponse.json(list)
  } catch (error) {
    console.error('Failed to update contact list:', error)
    return NextResponse.json({ error: 'Falha ao atualizar lista' }, { status: 500 })
  }
}

/** DELETE /api/contact-lists/[id] */
export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  const { id } = await params
  try {
    await contactListDb.delete(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete contact list:', error)
    return NextResponse.json({ error: 'Falha ao excluir lista' }, { status: 500 })
  }
}
