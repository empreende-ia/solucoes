import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { CreateTemplateSchema } from '@/lib/whatsapp/validators/template.schema'
import { templateService } from '@/lib/whatsapp/template.service'
import { MetaAPIError } from '@/lib/whatsapp/errors'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  try {
    const { data, error } = await supabase
      .from('templates')
      .select('id,name,components,status')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Rascunho não encontrado' }, { status: 404 })
    }

    if (data.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Apenas rascunhos (DRAFT) podem ser enviados.' }, { status: 400 })
    }

    const spec = data.components

    // Valida e normaliza para o contrato atual
    const parsed = CreateTemplateSchema.parse(spec)

    // ──────────────────────────────────────────────────────────────────────────
    // Validação de duplicata: verifica se já existe template com mesmo nome + idioma
    // ──────────────────────────────────────────────────────────────────────────
    const templateName = parsed.name
    const templateLanguage = parsed.language || 'pt_BR'

    const { data: existingTemplate } = await supabase
      .from('templates')
      .select('id, name, status')
      .eq('name', templateName)
      .eq('language', templateLanguage)
      .neq('id', id) // Ignora o próprio rascunho
      .neq('status', 'DRAFT') // Ignora outros rascunhos
      .maybeSingle()

    if (existingTemplate) {
      const statusLabel = existingTemplate.status === 'APPROVED'
        ? 'aprovado'
        : existingTemplate.status === 'PENDING'
          ? 'em análise'
          : existingTemplate.status?.toLowerCase() || 'existente'

      return NextResponse.json(
        {
          error: `Já existe um template "${templateName}" em ${templateLanguage} (${statusLabel}). Escolha outro nome ou edite o template existente.`,
          code: 'DUPLICATE_TEMPLATE',
          existingTemplateId: existingTemplate.id,
          suggestion: 'rename', // Pode ser usado pelo frontend para sugerir ação
        },
        { status: 409 } // 409 Conflict
      )
    }

    // Cria na Meta (Cloud API)
    const result = await templateService.create(parsed as any)

    // Atualiza o registro local para sair de "Rascunhos Manuais"
    const now = new Date().toISOString()

    // Regra de UX/Produto:
    // assim que enviamos para a Meta, o template entra em "Em análise" (PENDING).
    // O status real (APPROVED/REJECTED) virá pela sincronização com a Meta.
    const nextStatus = 'PENDING'
    const update: Record<string, unknown> = {
      status: nextStatus,
      updated_at: now,
    }

    // Tentativa (schema novo)
    ;(update as any).meta_id = result.id

    const attempt1 = await supabase
      .from('templates')
      .update(update as any)
      .eq('id', id)

    if (attempt1.error) {
      const msg = String(attempt1.error.message || '')
      const missingMetaId = msg.includes('meta_id') && (msg.includes('column') || msg.includes('does not exist'))
      if (!missingMetaId) {
        return NextResponse.json({ error: attempt1.error.message }, { status: 500 })
      }

      // Fallback schema antigo
      const { meta_id, ...legacy } = update as any
      const attempt2 = await supabase.from('templates').update(legacy).eq('id', id)
      if (attempt2.error) {
        return NextResponse.json({ error: attempt2.error.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      name: result.name,
      id: result.id,
      status: nextStatus,
    })
  } catch (error) {
    if (error instanceof MetaAPIError) {
      return NextResponse.json(
        {
          error: error.userMessage || error.message || 'Erro na Meta ao criar template.',
          meta: {
            code: error.code,
            subcode: error.subcode,
            type: error.type,
            fbtrace_id: error.fbtrace_id,
            message: error.message,
            userTitle: error.userTitle,
            userMessage: error.userMessage,
          },
        },
        { status: 400 }
      )
    }

    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
