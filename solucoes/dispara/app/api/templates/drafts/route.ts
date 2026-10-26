import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const CreateDraftSchema = z.object({
  name: z
    .string()
    .min(1, 'Nome obrigatório')
    .max(512, 'Nome muito longo')
    .transform((s) => s.trim())
    .refine((s) => /^[a-z0-9_]+$/.test(s), 'Nome: apenas letras minúsculas, números e underscore'),
  language: z.string().optional().default('pt_BR'),
  category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']).optional().default('UTILITY'),
  parameterFormat: z.enum(['positional', 'named']).optional().default('positional'),
})

function deriveContentFromSpec(spec: any): string {
  if (!spec || typeof spec !== 'object') return ''
  if (typeof spec.content === 'string') return spec.content
  if (spec.body && typeof spec.body.text === 'string') return spec.body.text
  return ''
}

/**
 * Gera um nome único para o template, adicionando sufixo _2, _3, etc. se necessário
 */
async function generateUniqueName(baseName: string, language: string): Promise<string> {
  // Verificar se já existe um template com esse nome e idioma
  const { data: existing } = await supabase
    .from('templates')
    .select('name')
    .eq('language', language)
    .like('name', `${baseName}%`)

  if (!existing || existing.length === 0) {
    return baseName
  }

  const existingNames = new Set(existing.map((t) => t.name))

  // Se o nome base não existe, usar ele
  if (!existingNames.has(baseName)) {
    return baseName
  }

  // Incrementar sufixo até achar um nome livre
  let counter = 2
  while (existingNames.has(`${baseName}_${counter}`)) {
    counter++
  }

  return `${baseName}_${counter}`
}

export async function GET() {
  try {
    // Tentativa 1: com filtro de source
    const attempt1 = await supabase
      .from('templates')
      .select('id,name,language,category,status,updated_at,created_at,parameter_format,components')
      .eq('status', 'DRAFT')
      .eq('source', 'manual')
      .order('updated_at', { ascending: false })

    if (attempt1.error) {
      const msg = String(attempt1.error.message || '')
      const missingSourceColumn = msg.includes('source') && (msg.includes('column') || msg.includes('does not exist'))

      if (!missingSourceColumn) {
        return NextResponse.json({ error: attempt1.error.message }, { status: 500 })
      }

      // Fallback para schema antigo (sem coluna source)
      const attempt2 = await supabase
        .from('templates')
        .select('id,name,language,category,status,updated_at,created_at,parameter_format,components')
        .eq('status', 'DRAFT')
        .order('updated_at', { ascending: false })

      if (attempt2.error) {
        return NextResponse.json({ error: attempt2.error.message }, { status: 500 })
      }

      const list = (attempt2.data || []).map((row: any) => {
        const spec = row.components
        return {
          id: row.id,
          name: row.name,
          language: row.language || 'pt_BR',
          category: row.category || 'UTILITY',
          status: row.status || 'DRAFT',
          updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
          parameterFormat: row.parameter_format || undefined,
          spec,
          // compat para o frontend (que às vezes busca em Template.content)
          content: deriveContentFromSpec(spec),
        }
      })

      return NextResponse.json(list)
    }

    const list = (attempt1.data || []).map((row: any) => {
      const spec = row.components
      return {
        id: row.id,
        name: row.name,
        language: row.language || 'pt_BR',
        category: row.category || 'UTILITY',
        status: row.status || 'DRAFT',
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
        parameterFormat: row.parameter_format || undefined,
        spec,
        content: deriveContentFromSpec(spec),
      }
    })

    return NextResponse.json(list)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json()
    const parsed = CreateDraftSchema.parse(json)

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // Gerar nome único para evitar conflitos
    const uniqueName = await generateUniqueName(parsed.name, parsed.language)

    // Spec (compatível com CreateTemplateSchema/TemplateService)
    const spec = {
      name: uniqueName,
      language: parsed.language,
      category: parsed.category,
      parameter_format: parsed.parameterFormat,
      body: { text: '' },
      header: null,
      footer: null,
      buttons: [],
      carousel: null,
      limited_time_offer: null,
    }

    // Tentativa 1 (schema novo)
    const attempt1 = await supabase
      .from('templates')
      .insert({
        id,
        name: uniqueName,
        language: parsed.language,
        category: parsed.category,
        status: 'DRAFT',
        source: 'manual',
        parameter_format: parsed.parameterFormat,
        components: spec,
        created_at: now,
        updated_at: now,
      } as any)
      .select('id,name,language,category,status,updated_at,created_at,parameter_format,components')
      .single()

    if (attempt1.error) {
      const msg = String(attempt1.error.message || '')
      const missingColumn =
        msg.includes('column') &&
        (msg.includes('source') || msg.includes('parameter_format'))

      if (!missingColumn) {
        return NextResponse.json({ error: attempt1.error.message }, { status: 500 })
      }

      // Fallback para schema antigo
      const attempt2 = await supabase
        .from('templates')
        .insert({
          id,
          name: uniqueName,
          language: parsed.language,
          category: parsed.category,
          status: 'DRAFT',
          components: spec,
          created_at: now,
          updated_at: now,
        } as any)
        .select('id,name,language,category,status,updated_at,created_at,components')
        .single()

      if (attempt2.error) {
        return NextResponse.json({ error: attempt2.error.message }, { status: 500 })
      }

      return NextResponse.json({
        id: attempt2.data.id,
        name: attempt2.data.name,
        language: attempt2.data.language || 'pt_BR',
        category: attempt2.data.category || 'UTILITY',
        status: attempt2.data.status || 'DRAFT',
        updatedAt: attempt2.data.updated_at || attempt2.data.created_at || now,
        spec: attempt2.data.components,
        content: deriveContentFromSpec(attempt2.data.components),
      })
    }

    return NextResponse.json({
      id: attempt1.data.id,
      name: attempt1.data.name,
      language: attempt1.data.language || 'pt_BR',
      category: attempt1.data.category || 'UTILITY',
      status: attempt1.data.status || 'DRAFT',
      updatedAt: attempt1.data.updated_at || attempt1.data.created_at || now,
      parameterFormat: attempt1.data.parameter_format || undefined,
      spec: attempt1.data.components,
      content: deriveContentFromSpec(attempt1.data.components),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
