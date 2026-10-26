import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'
import { supabase } from '@/lib/supabase'

/**
 * Converte os components do formato Meta API para o formato spec do editor manual.
 */
function metaComponentsToSpec(components: any[], parameterFormat: 'positional' | 'named' = 'positional'): any {
  const spec: any = {
    body: { text: '' },
    header: null,
    footer: null,
    buttons: [],
    carousel: null,
    limited_time_offer: null,
  }

  for (const comp of components || []) {
    const type = String(comp.type || '').toUpperCase()

    if (type === 'BODY') {
      spec.body = {
        text: comp.text || '',
        example: comp.example?.body_text ? { body_text: comp.example.body_text } : undefined,
      }
    }

    if (type === 'HEADER') {
      const format = String(comp.format || 'TEXT').toUpperCase()
      if (format === 'TEXT') {
        spec.header = {
          format: 'TEXT',
          text: comp.text || '',
          example: comp.example?.header_text ? { header_text: comp.example.header_text } : undefined,
        }
      } else {
        // IMAGE, VIDEO, DOCUMENT
        spec.header = {
          format,
          example: comp.example?.header_handle ? { header_handle: comp.example.header_handle } : undefined,
        }
      }
    }

    if (type === 'FOOTER') {
      spec.footer = {
        text: comp.text || '',
      }
    }

    if (type === 'BUTTONS') {
      spec.buttons = (comp.buttons || []).map((btn: any) => {
        const btnType = String(btn.type || '').toUpperCase()
        const base: any = {
          type: btnType,
          text: btn.text || '',
        }

        if (btnType === 'URL') {
          base.url = btn.url || ''
          if (btn.example) base.example = btn.example
        }
        if (btnType === 'PHONE_NUMBER') {
          base.phone_number = btn.phone_number || ''
        }
        if (btnType === 'QUICK_REPLY') {
          // quick reply só tem texto
        }
        if (btnType === 'COPY_CODE') {
          base.example = btn.example || ''
        }
        if (btnType === 'FLOW') {
          base.flow_id = btn.flow_id || ''
          base.flow_action = btn.flow_action || 'navigate'
          if (btn.navigate_screen) base.navigate_screen = btn.navigate_screen
        }

        return base
      })
    }

    if (type === 'CAROUSEL') {
      spec.carousel = comp.cards || []
    }

    if (type === 'LIMITED_TIME_OFFER') {
      spec.limited_time_offer = {
        text: comp.text || '',
        has_expiration: comp.has_expiration ?? true,
      }
    }
  }

  return spec
}

/**
 * Gera um nome único para o clone, adicionando sufixo _copia ou _copia_N
 */
async function generateUniqueName(baseName: string): Promise<string> {
  const cleanBase = baseName.replace(/_copia(_\d+)?$/, '')
  let candidate = `${cleanBase}_copia`

  // Verificar se já existe
  const { data: existing } = await supabase
    .from('templates')
    .select('name')
    .like('name', `${cleanBase}_copia%`)

  if (!existing || existing.length === 0) {
    return candidate
  }

  const existingNames = new Set(existing.map((t) => t.name))

  if (!existingNames.has(candidate)) {
    return candidate
  }

  // Incrementar sufixo
  let counter = 2
  while (existingNames.has(`${cleanBase}_copia_${counter}`)) {
    counter++
  }

  return `${cleanBase}_copia_${counter}`
}

/**
 * POST /api/templates/[name]/clone
 * Clona um template aprovado/existente para um novo rascunho manual.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const credentials = await getWhatsAppCredentials()

    if (!credentials?.businessAccountId || !credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais não configuradas.' },
        { status: 401 }
      )
    }

    // 1. Buscar template original na Meta API
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates?name=${encodeURIComponent(name)}&fields=id,name,status,language,category,parameter_format,components`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        timeoutMs: 8000,
      }
    )

    if (!response.ok) {
      const error = await safeJson<any>(response)
      return NextResponse.json(
        { error: error?.error?.message || 'Template não encontrado na Meta' },
        { status: response.status }
      )
    }

    const data = await safeJson<any>(response)

    if (!data.data || data.data.length === 0) {
      return NextResponse.json(
        { error: 'Template não encontrado na Meta' },
        { status: 404 }
      )
    }

    const template = data.data[0]
    const parameterFormat = template.parameter_format === 'NAMED' ? 'named' : 'positional'

    // 2. Converter components para spec
    const spec = metaComponentsToSpec(template.components || [], parameterFormat)

    // 3. Gerar nome único
    const newName = await generateUniqueName(template.name)

    // 4. Criar spec completo
    const fullSpec = {
      name: newName,
      language: template.language || 'pt_BR',
      category: template.category || 'UTILITY',
      parameter_format: parameterFormat,
      ...spec,
    }

    // 5. Inserir no banco como rascunho manual
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // Tentar com schema novo (com coluna source)
    const attempt1 = await supabase
      .from('templates')
      .insert({
        id,
        name: newName,
        language: fullSpec.language,
        category: fullSpec.category,
        status: 'DRAFT',
        source: 'manual',
        parameter_format: parameterFormat,
        components: fullSpec,
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
          name: newName,
          language: fullSpec.language,
          category: fullSpec.category,
          status: 'DRAFT',
          components: fullSpec,
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
        status: 'DRAFT',
        updatedAt: attempt2.data.updated_at || now,
        originalName: template.name,
      })
    }

    return NextResponse.json({
      id: attempt1.data.id,
      name: attempt1.data.name,
      language: attempt1.data.language || 'pt_BR',
      category: attempt1.data.category || 'UTILITY',
      status: 'DRAFT',
      updatedAt: attempt1.data.updated_at || now,
      parameterFormat: attempt1.data.parameter_format || 'positional',
      originalName: template.name,
    })
  } catch (error) {
    console.error('Clone Template Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao clonar template' },
      { status: 500 }
    )
  }
}
