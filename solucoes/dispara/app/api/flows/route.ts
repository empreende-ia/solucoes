import { NextResponse } from 'next/server'
import { z } from 'zod'

// Cache GET requests for 5 minutes - flows rarely change
// POST/PUT/DELETE remain dynamic by default
export const revalidate = 300

import { supabase } from '@/lib/supabase'
import { settingsDb } from '@/lib/supabase-db'
import { getFlowTemplateByKey } from '@/lib/flow-templates'

function isMissingDbColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const anyErr = error as any
  const msg = typeof anyErr.message === 'string' ? anyErr.message : ''
  return anyErr.code === '42703' || /column .* does not exist/i.test(msg)
}

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const anyErr = error as any
  const msg = typeof anyErr.message === 'string' ? anyErr.message : ''
  return anyErr.code === 'PGRST205' || /could not find the table/i.test(msg)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const anyErr = error as any
    if (typeof anyErr.message === 'string') return anyErr.message
    if (typeof anyErr.error === 'string') return anyErr.error
    if (typeof anyErr.details === 'string' && anyErr.details) return anyErr.details
    if (typeof anyErr.hint === 'string' && anyErr.hint) return anyErr.hint
  }
  return 'Erro desconhecido'
}

const CreateFlowSchema = z
  .object({
    name: z.string().min(1).max(140),
    templateKey: z.string().min(1).max(80).optional(),
  })
  .strict()

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('flows')
      // Usar '*' para não quebrar quando a migration ainda não foi aplicada.
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data || [], {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Failed to list flows:', error)

    // Se a tabela não existir (migration não aplicada), não quebra a UI.
    if (isMissingTable(error)) {
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
          'X-Warning': 'flows_missing',
        },
      })
    }

    // Em dev, devolvemos a causa para agilizar debug (sem vazar em prod)
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ error: 'Falha ao listar flows', details: message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Falha ao listar flows' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const input = CreateFlowSchema.parse(json)

    const now = new Date().toISOString()

    // Spec inicial com Start node
    const initialSpec = {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      // Form spec (para o modo "Formulário" do builder). Mantido dentro de `spec`
      // para evitar migrations e manter compatibilidade com o spec atual.
      form: {
        version: 1,
        screenId: 'FORM',
        title: input.name,
        intro: 'Preencha os dados abaixo:',
        submitLabel: 'Enviar',
        fields: [],
      },
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 80, y: 120 },
          data: { label: 'Início' },
        },
      ],
      edges: [],
    }

    const tpl = input.templateKey ? getFlowTemplateByKey(input.templateKey) : null

    const fullInsert: Record<string, unknown> = {
      name: input.name,
      status: 'DRAFT',
      spec: initialSpec,
      created_at: now,
      updated_at: now,
      ...(tpl
        ? {
            template_key: tpl.key,
            flow_json: tpl.flowJson,
            flow_version: typeof (tpl.flowJson as any)?.version === 'string' ? ((tpl.flowJson as any).version as string) : null,
            mapping: tpl.defaultMapping,
          }
        : {}),
    }

    // 1) tenta inserir com colunas novas
    let { data, error } = await supabase.from('flows').insert(fullInsert).select('*').limit(1)

    // 2) fallback: se a coluna não existir (migration não aplicada), remove campos novos
    if (error && isMissingDbColumn(error)) {
      const minimalInsert: Record<string, unknown> = {
        name: input.name,
        status: 'DRAFT',
        spec: initialSpec,
        created_at: now,
        updated_at: now,
      }
      ;({ data, error } = await supabase.from('flows').insert(minimalInsert).select('*').limit(1))
    }

    if (error) {
      const message = getErrorMessage(error)
      console.error('Failed to create flow:', error)

      // Erros de banco/config são 500; validação já foi tratada pelo Zod.
      if (process.env.NODE_ENV !== 'production') {
        return NextResponse.json({ error: 'Erro ao criar flow', details: message }, { status: 500 })
      }

      return NextResponse.json({ error: 'Erro ao criar flow' }, { status: 500 })
    }

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row) return NextResponse.json({ error: 'Falha ao criar flow' }, { status: 500 })

    // Sincroniza services do template para settingsDb (usado pelo endpoint)
    if (tpl?.flowJson) {
      try {
        const flowJsonObj = tpl.flowJson as Record<string, unknown>
        const screens = Array.isArray(flowJsonObj?.screens) ? flowJsonObj.screens : []
        const isBookingFlow = screens.some((s: any) => String(s?.id || '') === 'BOOKING_START')
        
        if (isBookingFlow) {
          // Extrai services de __example__ no flow_json
          let servicesFromTemplate: any[] | null = null
          for (const screen of screens) {
            const dataSchema = (screen as any)?.data
            if (dataSchema && typeof dataSchema === 'object') {
              const servicesSchema = (dataSchema as any).services
              if (servicesSchema && Array.isArray(servicesSchema.__example__)) {
                servicesFromTemplate = servicesSchema.__example__
                break
              }
            }
          }
          
          if (servicesFromTemplate && servicesFromTemplate.length > 0) {
            const normalizedServices = servicesFromTemplate
              .map((opt: any) => ({
                id: typeof opt?.id === 'string' ? opt.id.trim() : String(opt?.id ?? '').trim(),
                title: typeof opt?.title === 'string' ? opt.title.trim() : String(opt?.title ?? '').trim(),
                ...(typeof opt?.durationMinutes === 'number' ? { durationMinutes: opt.durationMinutes } : {}),
              }))
              .filter((opt) => opt.id && opt.title)
            
            if (normalizedServices.length > 0) {
              console.log('[flows/POST] Salvando booking_services do template:', normalizedServices.length, 'serviços')
              await settingsDb.set('booking_services', JSON.stringify(normalizedServices))
            }
          }
        }
      } catch (err) {
        console.error('[flows/POST] Erro ao sincronizar services:', err)
      }
    }

    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    const message = getErrorMessage(error)
    // Aqui normalmente é Zod (input inválido) ou JSON inválido.
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
