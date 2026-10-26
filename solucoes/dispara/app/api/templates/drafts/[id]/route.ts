import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const PatchDraftSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/, 'Nome: apenas letras minúsculas, números e underscore')
      .optional(),
    language: z.string().optional(),
    category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']).optional(),
    parameterFormat: z.enum(['positional', 'named']).optional(),
    spec: z.unknown().optional(),
  })
  .strict()

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('id,name,language,category,status,updated_at,created_at,parameter_format,components,header_location')
      .eq('id', id)
      .limit(1)

    if (error) {
      // Alguns ambientes/estados antigos podem ter IDs duplicados (não-únicos).
      // Evitamos quebrar com .single() e retornamos um erro claro.
      return NextResponse.json({ error: error.message || 'Falha ao buscar rascunho' }, { status: 500 })
    }

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row) {
      return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 })
    }

    // Se tiver header_location salvo, injetar no spec.header para o builder carregar
    let spec = row.components
    if (row.header_location && spec?.header?.format === 'LOCATION') {
      spec = {
        ...spec,
        header: {
          ...spec.header,
          location: row.header_location,
        },
      }
    }

    return NextResponse.json({
      id: row.id,
      name: row.name,
      language: row.language || 'pt_BR',
      category: row.category || 'UTILITY',
      status: row.status || 'DRAFT',
      updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      parameterFormat: (row as any).parameter_format || undefined,
      spec,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const json = await req.json()
    const patch = PatchDraftSchema.parse(json)
    const now = new Date().toISOString()

    // Extrai campos do spec se não estiverem no nível raiz
    // O frontend envia tudo dentro de spec, mas o DB espera no nível raiz
    const specObj = patch.spec && typeof patch.spec === 'object' ? (patch.spec as Record<string, unknown>) : null
    const nameFromSpec = specObj?.name as string | undefined
    const languageFromSpec = specObj?.language as string | undefined
    const categoryFromSpec = specObj?.category as string | undefined
    const paramFormatFromSpec = specObj?.parameter_format as string | undefined

    // Extrair header.location do spec para salvar em coluna separada (não é sobrescrito pelo sync da Meta)
    const headerObj = specObj?.header as Record<string, unknown> | undefined
    const headerLocation = headerObj?.location as { latitude: string; longitude: string; name?: string; address?: string } | undefined

    const update: Record<string, unknown> = { updated_at: now }
    if (patch.name || nameFromSpec) update.name = patch.name || nameFromSpec
    if (patch.language || languageFromSpec) update.language = patch.language || languageFromSpec
    if (patch.category || categoryFromSpec) update.category = patch.category || categoryFromSpec
    if (patch.parameterFormat || paramFormatFromSpec) (update as any).parameter_format = patch.parameterFormat || paramFormatFromSpec

    // Preparar components para salvar (remover header.location que vai em coluna separada)
    if (patch.spec !== undefined) {
      let componentsToSave = patch.spec
      // Se tem header.location, criar cópia sem ele para evitar enviar para Meta na submissão
      if (headerLocation && headerLocation.latitude && headerLocation.longitude && specObj?.header) {
        const { location: _ignored, ...headerWithoutLocation } = headerObj as Record<string, unknown>
        componentsToSave = {
          ...specObj,
          header: headerWithoutLocation,
        }
      }
      update.components = componentsToSave
    }

    // Salvar header_location separadamente para não ser perdido no sync da Meta
    if (headerLocation && headerLocation.latitude && headerLocation.longitude) {
      update.header_location = {
        latitude: String(headerLocation.latitude),
        longitude: String(headerLocation.longitude),
        name: String(headerLocation.name || ''),
        address: String(headerLocation.address || ''),
      }
    }

    // Tentativa 1 (schema novo)
    const attempt1 = await supabase
      .from('templates')
      .update(update as any)
      .eq('id', id)
      .select('id,name,language,category,status,updated_at,created_at,parameter_format,components')
      .limit(1)

    if (attempt1.error) {
      const msg = String(attempt1.error.message || '')
      const missingColumn = msg.includes('column') && msg.includes('parameter_format')
      if (!missingColumn) {
        return NextResponse.json({ error: attempt1.error.message }, { status: 500 })
      }

      // Fallback para schema antigo
      const { parameter_format, ...legacyUpdate } = update as any
      const attempt2 = await supabase
        .from('templates')
        .update(legacyUpdate)
        .eq('id', id)
        .select('id,name,language,category,status,updated_at,created_at,components')
        .limit(1)

      if (attempt2.error) {
        return NextResponse.json({ error: attempt2.error.message }, { status: 500 })
      }

      const row2 = Array.isArray(attempt2.data) ? attempt2.data[0] : (attempt2.data as any)
      if (!row2) {
        return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 })
      }

      return NextResponse.json({
        id: row2.id,
        name: row2.name,
        language: row2.language || 'pt_BR',
        category: row2.category || 'UTILITY',
        status: row2.status || 'DRAFT',
        updatedAt: row2.updated_at || row2.created_at || now,
        spec: row2.components,
      })
    }

    const row1 = Array.isArray(attempt1.data) ? attempt1.data[0] : (attempt1.data as any)
    if (!row1) {
      return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      id: row1.id,
      name: row1.name,
      language: row1.language || 'pt_BR',
      category: row1.category || 'UTILITY',
      status: row1.status || 'DRAFT',
      updatedAt: row1.updated_at || row1.created_at || now,
      parameterFormat: (row1 as any).parameter_format || undefined,
      spec: row1.components,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const { error } = await supabase.from('templates').delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
