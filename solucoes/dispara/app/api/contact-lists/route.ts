import { NextRequest, NextResponse } from 'next/server'
import { contactListDb, type ContactListFilters } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

/** GET /api/contact-lists — listas salvas (smart lists) */
export async function GET(request: Request) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  try {
    const lists = await contactListDb.getAll()
    return NextResponse.json(lists, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('Failed to fetch contact lists:', error)
    return NextResponse.json({ error: 'Falha ao buscar listas' }, { status: 500 })
  }
}

/** POST /api/contact-lists — cria lista { name, filters } */
export async function POST(request: Request) {
  const auth = await requireSessionOrApiKey(request as NextRequest)
  if (auth) return auth
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Nome da lista é obrigatório' }, { status: 400 })
    }
    const list = await contactListDb.create({
      name,
      filters: sanitizeFilters(body?.filters),
    })
    return NextResponse.json(list, { status: 201 })
  } catch (error) {
    console.error('Failed to create contact list:', error)
    return NextResponse.json({ error: 'Falha ao criar lista' }, { status: 500 })
  }
}
