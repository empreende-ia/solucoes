import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { supabase } from '@/lib/supabase'
import { ensureHeaderMediaPreviewUrl, getTemplateHeaderMediaExampleLink } from '@/lib/whatsapp/template-media-preview'

export const dynamic = 'force-dynamic'

type BackfillBody = {
  limit?: number
  offset?: number
  status?: string
  force?: boolean
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim())

export async function POST(request: NextRequest) {
  const auth = await requireSessionOrApiKey(request)
  if (auth) return auth

  let body: BackfillBody = {}
  try {
    body = (await request.json()) as BackfillBody
  } catch {
    body = {}
  }

  const url = new URL(request.url)
  const limitRaw = Number(url.searchParams.get('limit') || body.limit || 50)
  const offsetRaw = Number(url.searchParams.get('offset') || body.offset || 0)
  const statusRaw = String(url.searchParams.get('status') || body.status || 'APPROVED').toUpperCase()
  const forceRaw = String(url.searchParams.get('force') || body.force || '')
  const force = forceRaw === '1' || forceRaw === 'true'

  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0
  const status = statusRaw === 'ALL' ? 'ALL' : statusRaw

  const credentials = await getWhatsAppCredentials()
  if (!credentials?.accessToken) {
    return NextResponse.json(
      { error: 'Credenciais não configuradas.' },
      { status: 401 }
    )
  }

  const client = supabase.admin
  if (!client) {
    return NextResponse.json(
      { error: 'Supabase admin indisponível.' },
      { status: 500 }
    )
  }

  let query = client
    .from('templates')
    .select('name,status,components,header_media_preview_url,header_media_preview_expires_at,header_media_hash', {
      count: 'exact',
    })
    .order('updated_at', { ascending: false })

  if (status !== 'ALL') {
    query = query.eq('status', status)
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Falha ao buscar templates.' },
      { status: 500 }
    )
  }

  let processed = 0
  let skipped = 0
  let generated = 0
  let cached = 0
  let failed = 0
  const errors: Array<{ name: string; reason: string }> = []

  for (const row of data || []) {
    const name = String(row?.name || '').trim()
    if (!name) {
      skipped += 1
      continue
    }

    const headerInfo = getTemplateHeaderMediaExampleLink(row?.components)
    const format = headerInfo.format ? String(headerInfo.format).toUpperCase() : undefined
    const isMediaHeader = Boolean(format && ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(format))
    const example = headerInfo.example

    if (!isMediaHeader || !example || !isHttpUrl(example)) {
      skipped += 1
      continue
    }

    processed += 1
    const result = await ensureHeaderMediaPreviewUrl({
      templateName: name,
      components: row?.components || [],
      accessToken: credentials.accessToken,
      force,
      logger: (message, meta) => console.warn(`[TemplatePreviewBackfill] ${message}`, meta || ''),
    })

    if (result?.source === 'generated') {
      generated += 1
    } else if (result?.source === 'cache') {
      cached += 1
    } else {
      failed += 1
      errors.push({ name, reason: 'Falha ao gerar preview' })
    }
  }

  return NextResponse.json({
    total: count ?? (data || []).length,
    processed,
    skipped,
    generated,
    cached,
    failed,
    errors,
    limit,
    offset,
    status,
    force,
  })
}
