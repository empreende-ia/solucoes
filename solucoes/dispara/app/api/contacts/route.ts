import { NextRequest, NextResponse } from 'next/server'
import { contactDb } from '@/lib/supabase-db'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import {
  CreateContactSchema,
  DeleteContactsSchema,
  validateBody,
  formatZodErrors
} from '@/lib/api-validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/contacts
 * Lista todos os contatos do banco (Supabase)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireSessionOrApiKey(request as NextRequest)
    if (auth) return auth

    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const search = url.searchParams.get('search') || ''
    const status = url.searchParams.get('status') || ''
    const tag = url.searchParams.get('tag') || ''
    // multi-tag (paridade GHL): ?tags=a,b,c&tagMatch=any|all
    const tagsParam = url.searchParams.get('tags') || ''
    const tags = tagsParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const tagMatch = url.searchParams.get('tagMatch') === 'all' ? 'all' : 'any'

    const wantsPaged =
      limitParam !== null ||
      offsetParam !== null ||
      search.length > 0 ||
      status.length > 0 ||
      tag.length > 0 ||
      tags.length > 0

    if (wantsPaged) {
      const limitRaw = Number(limitParam)
      const offsetRaw = Number(offsetParam)
      const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 10))
      const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0)

      const result = await contactDb.list({
        limit,
        offset,
        search,
        status,
        tag,
        tags,
        tagMatch,
      })

      return NextResponse.json(
        { ...result, limit, offset },
        {
          headers: {
            // Dados dinâmicos: cache compartilhado (CDN/edge) causa estado “fantasma” pós CRUD.
            'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      )
    }

    const contacts = await contactDb.getAll()
    return NextResponse.json(contacts, {
      headers: {
        // Dados dinâmicos: cache compartilhado (CDN/edge) causa estado “fantasma” pós CRUD.
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      }
    })
  } catch (error) {
    console.error('Failed to fetch contacts:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar contatos' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/contacts
 * Add a single contact
 */
export async function POST(request: Request) {
  try {
    const auth = await requireSessionOrApiKey(request as NextRequest)
    if (auth) return auth

    const body = await request.json()

    // Validate input
    const validation = validateBody(CreateContactSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    // Normalize null to undefined for optional fields
    const contactData = {
      ...validation.data,
      email: validation.data.email ?? undefined,
    }

    const contact = await contactDb.add(contactData)
    return NextResponse.json(contact, { status: 201 })
  } catch (error: any) {
    console.error('Failed to add contact:', error)
    return NextResponse.json(
      { error: 'Falha ao adicionar contato', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/contacts
 * Delete multiple contacts by IDs
 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireSessionOrApiKey(request as NextRequest)
    if (auth) return auth

    const body = await request.json()

    // Validate input
    const validation = validateBody(DeleteContactsSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const deleted = await contactDb.deleteMany(validation.data.ids)
    return NextResponse.json({ deleted })
  } catch (error) {
    console.error('Failed to delete contacts:', error)
    return NextResponse.json(
      { error: 'Falha ao deletar contatos' },
      { status: 500 }
    )
  }
}
