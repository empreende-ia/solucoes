import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { templateDb } from '@/lib/supabase-db'
import { supabase } from '@/lib/supabase'
import { canonicalTemplateCategory } from '@/lib/template-category'
import { createHash } from 'crypto'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'
import { OWNER_KINDS, requireAttendantPermission, requirePrincipal } from '@/lib/principal'

// Cache GET requests for 5 minutes - templates rarely change
// POST/PUT/DELETE remain dynamic by default
export const revalidate = 300

interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: string
  text?: string
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>
  // Para LOCATION headers
  location?: {
    latitude: string
    longitude: string
    name?: string
    address?: string
  }
}

interface MetaTemplate {
  name: string
  status: string
  language: string
  category: string
  parameter_format?: string
  components: MetaTemplateComponent[]
  last_updated_time: string
}

const normalizeParameterFormat = (value?: string) => {
  if (!value) return 'positional'
  const normalized = String(value).toLowerCase()
  return normalized === 'named' ? 'named' : 'positional'
}

// Helper to fetch ALL templates from Meta API (with pagination)
async function fetchTemplatesFromMeta(businessAccountId: string, accessToken: string) {
  const allTemplates: MetaTemplate[] = []
  let nextUrl: string | null = `https://graph.facebook.com/v24.0/${businessAccountId}/message_templates?fields=name,status,language,category,parameter_format,components,last_updated_time&limit=100`

  // Guardrail: evita loop infinito caso a paginação da Meta esteja quebrada.
  let pages = 0
  const maxPages = 25

  // Paginate through all results
  while (nextUrl) {
    pages++
    if (pages > maxPages) {
      throw new Error(`Limite de paginação atingido ao buscar templates (>${maxPages} páginas).`) 
    }

    const res: Response = await fetchWithTimeout(nextUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      timeoutMs: 12000,
    })

    if (!res.ok) {
      const error = await safeJson<any>(res)
      throw new Error(error?.error?.message || 'Falha ao buscar templates na Meta')
    }

    const data = await safeJson<any>(res)
    allTemplates.push(...(data?.data || []))

    // Check for next page
    nextUrl = data?.paging?.next || null
  }

  // Transform Meta format to our App format
  return allTemplates.map((t: MetaTemplate) => {
    const parameterFormat = normalizeParameterFormat(t.parameter_format)
    const bodyComponent = t.components.find((c: MetaTemplateComponent) => c.type === 'BODY')
    const canonicalCategory = canonicalTemplateCategory(t.category)
    const specHash = createHash('sha256')
      .update(JSON.stringify({
        name: t.name,
        language: t.language,
        category: canonicalCategory,
        parameter_format: parameterFormat,
        components: t.components,
      }))
      .digest('hex')

    return {
      id: t.name,
      name: t.name,
      category: canonicalCategory,
      language: t.language,
      status: t.status,
      parameterFormat,
      specHash,
      fetchedAt: new Date().toISOString(),
      content: bodyComponent?.text || 'No content',
      preview: bodyComponent?.text || '',
      lastUpdated: t.last_updated_time,
      components: t.components
    }
  })
}

// Helper to sync templates to local Supabase DB
// This ensures templateDb.getByName() works during campaign dispatch
// IMPORTANTE: Faz FULL REPLACE - deleta templates antigos que não existem mais na Meta
async function syncTemplatesToLocalDb(templates: ReturnType<typeof fetchTemplatesFromMeta> extends Promise<infer T> ? T : never) {
  try {
    const now = new Date().toISOString()

    const rows = templates.map((template) => ({
      name: template.name,
      language: template.language,
      category: template.category,
      components: template.components,
      status: template.status,
      parameter_format: (template as any).parameterFormat || 'positional',
      spec_hash: (template as any).specHash || null,
      fetched_at: (template as any).fetchedAt || now,
    }))

    // Criar set de (name, language) dos templates da Meta para comparação
    const metaTemplateKeys = new Set(
      templates.map((t) => `${t.name}::${t.language}`)
    )

    // Buscar templates locais para identificar os que devem ser removidos
    const localTemplates = await templateDb.getAll()
    const templatesToDelete = localTemplates.filter(
      (t) => !metaTemplateKeys.has(`${t.name}::${t.language}`)
    )

    // Deletar templates que não existem mais na Meta
    if (templatesToDelete.length > 0) {
      for (const t of templatesToDelete) {
        await supabase
          .from('templates')
          .delete()
          .eq('name', t.name)
          .eq('language', t.language)
      }

      console.log(`[Templates] 🗑️ Removidos ${templatesToDelete.length} templates que não existem mais na Meta`)
    }

    // Upsert dos templates atuais da Meta
    // Ambientes antigos podem não ter as colunas parameter_format/spec_hash/fetched_at ainda.
    try {
      await templateDb.upsert(rows)
    } catch (error: any) {
      const message = String(error?.message || error)
      const missingColumn =
        message.includes('column') &&
        (message.includes('parameter_format') || message.includes('spec_hash') || message.includes('fetched_at'))

      if (!missingColumn) throw error

      console.warn('[Templates] Falha ao salvar colunas novas (schema antigo). Fazendo fallback para payload legado.')
      await templateDb.upsert(
        rows.map(({ name, language, category, components, status }) => ({
          name,
          language,
          category,
          components,
          status,
        }))
      )
    }

    console.log(`[Templates] ✅ Synced ${templates.length} templates to local database`)
  } catch (error) {
    // Log but don't fail the request - sync is best-effort
    console.error('[Templates] Failed to sync templates to local database:', error)
  }
}


// GET /api/templates - Busca templates usando credenciais salvas (Supabase/env)
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const source = url.searchParams.get('source')

  // Atendente (PWA) só lê a cópia local (?source=local, com canView). Sem source=local
  // o GET sincroniza com a Meta e apaga linhas locais — isso fica restrito ao dono.
  const denied = source === 'local'
    ? requireAttendantPermission(request, 'canView')
    : requirePrincipal(request, OWNER_KINDS)
  if (denied) return denied

  if (source === 'local') {
    try {
      const templates = await templateDb.getAll()
      return NextResponse.json(templates)
    } catch (error) {
      console.error('Local templates error:', error)
      return NextResponse.json(
        { error: 'Falha ao buscar templates locais' },
        { status: 500 }
      )
    }
  }

  try {
    const credentials = await getWhatsAppCredentials()

    if (!credentials?.businessAccountId || !credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais não configuradas. Configure em Configurações.' },
        { status: 401 }
      )
    }

    const templates = await fetchTemplatesFromMeta(
      credentials.businessAccountId,
      credentials.accessToken
    )

    // 🆕 Sync templates to local Supabase DB
    // Importante: aguardamos para evitar race condition com /api/campaign/precheck.
    await syncTemplatesToLocalDb(templates)

    // Merge com dados locais (ex.: cache de preview de mídia e header_location).
    const local = await templateDb.getAll().catch(() => [])
    const localByName = new Map(local.map((t) => [t.name, t]))
    const merged = templates.map((t) => {
      const cached = localByName.get(t.name)
      if (!cached) return t

      // Se o template local tem location injetado no header, usar os components locais
      // para garantir que o preview funcione corretamente
      const localHasLocation = cached.components?.some(
        (c: any) => c.type === 'HEADER' && c.format === 'LOCATION' && c.location
      )

      return {
        ...t,
        // Usar components locais se tiver location injetado
        components: localHasLocation ? cached.components : t.components,
        headerMediaPreviewUrl: cached.headerMediaPreviewUrl ?? null,
        headerMediaPreviewExpiresAt: cached.headerMediaPreviewExpiresAt ?? null,
        headerMediaId: cached.headerMediaId ?? null,
        headerMediaHash: cached.headerMediaHash ?? null,
      }
    })

    return NextResponse.json(merged)
  } catch (error) {
    console.error('Meta API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}


// POST /api/templates - Busca templates (body opcional; fallback para Supabase/env)
export async function POST(request: NextRequest) {
  // Só o dono (o proxy já exige sessão; defesa em profundidade)
  const denied = requirePrincipal(request, OWNER_KINDS)
  if (denied) return denied

  let businessAccountId: string | undefined
  let accessToken: string | undefined

  // Try to get from request body first
  try {
    const body = await request.json()
    // Only use if they look like real credentials (not masked)
    if (body.businessAccountId && body.accessToken && !body.accessToken.includes('***')) {
      businessAccountId = body.businessAccountId
      accessToken = body.accessToken
    }
  } catch {
    // Body vazio/inválido: usar credenciais salvas
  }

  // Fallback para credenciais salvas (Supabase/env)
  if (!businessAccountId || !accessToken) {
    const credentials = await getWhatsAppCredentials()
    if (credentials) {
      businessAccountId = credentials.businessAccountId
      accessToken = credentials.accessToken
    }
  }

  if (!businessAccountId || !accessToken) {
    return NextResponse.json(
      { error: 'Credenciais não configuradas. Configure em Configurações.' },
      { status: 401 }
    )
  }

  try {
    const templates = await fetchTemplatesFromMeta(businessAccountId, accessToken)
    return NextResponse.json(templates)
  } catch (error) {
    console.error('Meta API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
