import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CreateTemplateSchema } from '@/lib/whatsapp/validators/template.schema'
import { templateService } from '@/lib/whatsapp/template.service'
import { MetaAPIError } from '@/lib/whatsapp/errors'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[API CREATE TEMPLATE] Incoming Payload Category:', body.category);

    // 1. Validate Body do Payload (Single vs Bulk)
    let templatesData: z.infer<typeof CreateTemplateSchema>[] = []

    if (Array.isArray(body)) {
      templatesData = body
    } else if (body.templates && Array.isArray(body.templates)) {
      templatesData = body.templates
    } else {
      templatesData = [body]
    }

    // 2. Validação Inicial (Zod) e Processamento em PARALELO
    // Rate limit da Meta: 200 calls/hora - paralelização é segura para batches típicos (5-20 templates)
    const promises = templatesData.map(async (temp) => {
      try {
        // Valida estrutura
        const parsed = CreateTemplateSchema.parse(temp)

        // Chama Serviço ("A Fábrica")
        const result = await templateService.create(parsed)
        return { success: true as const, result, name: temp.name }

      } catch (err: any) {
        console.error(`[CREATE] Erro ao criar template ${temp.name || 'desconhecido'}:`, err)
        return { success: false as const, name: temp.name, error: err.message || 'Erro desconhecido' }
      }
    })

    const outcomes = await Promise.allSettled(promises)

    const results: any[] = []
    const errors: { name: string; error: string }[] = []

    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        if (outcome.value.success) {
          results.push(outcome.value.result)
        } else {
          errors.push({ name: outcome.value.name, error: outcome.value.error })
        }
      } else {
        // Promise rejeitada (não deveria acontecer com try/catch interno, mas por segurança)
        errors.push({ name: 'unknown', error: outcome.reason?.message || 'Erro inesperado' })
      }
    }

    // 3. Resposta
    if (errors.length > 0 && results.length === 0) {
      // Falha total
      return NextResponse.json({
        error: 'Falha ao criar templates',
        details: errors
      }, { status: 400 })
    }

    if (errors.length > 0) {
      // Sucesso parcial
      return NextResponse.json({
        message: 'Alguns templates foram criados, outros falharam',
        created: results,
        failed: errors
      }, { status: 207 })
    }

    // Sucesso total
    // Retorna formato compatível com frontend (single object ou array)
    if (results.length === 1) {
      return NextResponse.json(results[0], { status: 200 })
    }

    return NextResponse.json({ templates: results }, { status: 200 })

  } catch (error: any) {
    console.error('[API] Erro fatal no controller:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
