import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { supabase } from '@/lib/supabase'
import { settingsDb } from '@/lib/supabase-db'

function isMissingDbColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const anyErr = error as any
  const msg = typeof anyErr.message === 'string' ? anyErr.message : ''
  return anyErr.code === '42703' || /column .* does not exist/i.test(msg)
}

const PatchFlowSchema = z
  .object({
    name: z.string().min(1).max(140).optional(),
    status: z.string().min(1).max(40).optional(),
    metaFlowId: z.string().min(1).max(128).optional(),
    resetMeta: z.boolean().optional(),
    spec: z.unknown().optional(),
    templateKey: z.string().min(1).max(80).optional(),
    flowJson: z.unknown().optional(),
    mapping: z.unknown().optional(),
  })
  .strict()

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const { data, error } = await supabase
      .from('flows')
      // '*' evita quebra quando a migration ainda não foi aplicada.
      .select('*')
      .eq('id', id)
      .limit(1)

    if (error) return NextResponse.json({ error: error.message || 'Falha ao buscar flow' }, { status: 500 })

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row) return NextResponse.json({ error: 'Flow não encontrado' }, { status: 404 })

    return NextResponse.json(row)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const json = await req.json()
    const patch = PatchFlowSchema.parse(json)
    const now = new Date().toISOString()
    const flowJsonObj = patch.flowJson && typeof patch.flowJson === 'object' ? (patch.flowJson as Record<string, unknown>) : null
    let specScreensCount: number | null = null
    let specHasConfirmationKeys = false
    let flowJsonHasConfirmationKeys = false
    try {
      const specString =
        typeof patch.spec === 'string' ? patch.spec : patch.spec && typeof patch.spec === 'object' ? JSON.stringify(patch.spec) : ''
      const flowJsonString = flowJsonObj ? JSON.stringify(flowJsonObj) : ''
      specHasConfirmationKeys = Boolean(specString && specString.includes('confirmation_'))
      flowJsonHasConfirmationKeys = Boolean(flowJsonString && flowJsonString.includes('confirmation_'))
      if (patch.spec && typeof patch.spec === 'object') {
        const specRoot = patch.spec as any
        const dynamic = specRoot.dynamicFlow && typeof specRoot.dynamicFlow === 'object' ? specRoot.dynamicFlow : specRoot
        specScreensCount = Array.isArray(dynamic?.screens) ? dynamic.screens.length : null
      } else if (typeof patch.spec === 'string') {
        const parsed = JSON.parse(patch.spec)
        const dynamic = parsed?.dynamicFlow && typeof parsed.dynamicFlow === 'object' ? parsed.dynamicFlow : parsed
        specScreensCount = Array.isArray(dynamic?.screens) ? dynamic.screens.length : null
      }
    } catch {}
    const update: Record<string, unknown> = { updated_at: now }

    // Se o Flow já foi publicado na Meta, ele não pode ser alterado.
    // UX: ao renomear, resetamos a publicação (limpa meta_flow_id) para que o próximo publish crie um Flow novo na Meta.
    let shouldResetMeta = !!patch.resetMeta
    let currentName: string | null = null
    let currentMetaStatus: string | null = null
    let currentMetaFlowId: string | null = null
    if (patch.name !== undefined && !shouldResetMeta) {
      try {
        let metaRow: any = null
        let metaErr: any = null
        ;({ data: metaRow, error: metaErr } = await supabase
          .from('flows')
          .select('name, meta_flow_id, meta_status, meta_preview_url, meta_validation_errors, meta_last_checked_at, meta_published_at')
          .eq('id', id)
          .limit(1))
        if (metaErr && isMissingDbColumn(metaErr)) {
          ;({ data: metaRow, error: metaErr } = await supabase.from('flows').select('name, meta_flow_id, meta_status').eq('id', id).limit(1))
        }
        if (!metaErr) {
          const row = Array.isArray(metaRow) ? metaRow[0] : (metaRow as any)
          currentName = typeof row?.name === 'string' ? row.name : null
          currentMetaStatus = typeof row?.meta_status === 'string' ? row.meta_status : null
          currentMetaFlowId = typeof row?.meta_flow_id === 'string' ? row.meta_flow_id : null
          const renamed = currentName !== null && patch.name.trim() && currentName.trim() !== patch.name.trim()
          if (renamed && currentMetaFlowId && String(currentMetaStatus || '').toUpperCase() === 'PUBLISHED') {
            shouldResetMeta = true
          }
        }
      } catch {}
    }

    if (patch.name !== undefined) update.name = patch.name
    if (patch.status !== undefined) update.status = patch.status
    if (patch.metaFlowId !== undefined) update.meta_flow_id = patch.metaFlowId
    if (patch.spec !== undefined) update.spec = patch.spec
    if (patch.templateKey !== undefined) update.template_key = patch.templateKey
    if (patch.flowJson !== undefined) {
      update.flow_json = patch.flowJson
      update.flow_version =
        patch.flowJson && typeof patch.flowJson === 'object' && typeof (patch.flowJson as any).version === 'string'
          ? ((patch.flowJson as any).version as string)
          : null
    }
    if (patch.mapping !== undefined) update.mapping = patch.mapping

    if (shouldResetMeta) {
      update.meta_flow_id = null
      update.meta_status = null
      update.meta_preview_url = null
      update.meta_validation_errors = null
      update.meta_last_checked_at = null
      update.meta_published_at = null
    }

    let { data, error } = await supabase.from('flows').update(update).eq('id', id).select('*').limit(1)

    // Fallback: se colunas novas não existirem, remove-as e tenta novamente.
    if (error && isMissingDbColumn(error)) {
      const stripped: Record<string, unknown> = { ...update }
      delete stripped.template_key
      delete stripped.flow_json
      delete stripped.flow_version
      delete stripped.mapping
      delete stripped.meta_status
      delete stripped.meta_preview_url
      delete stripped.meta_validation_errors
      delete stripped.meta_last_checked_at
      delete stripped.meta_published_at
      ;({ data, error } = await supabase.from('flows').update(stripped).eq('id', id).select('*').limit(1))
    }

    if (error) return NextResponse.json({ error: error.message || 'Falha ao atualizar flow' }, { status: 500 })

    try {
      const spec = patch.spec && typeof patch.spec === 'object' ? (patch.spec as any) : null
      
      // Tenta extrair serviços de múltiplos locais possíveis:
      // 1. spec.dynamicFlow.services (editor unificado)
      // 2. spec.booking.services (legado)
      // 3. flow_json.screens[].data.services.__example__ (template inicial)
      let servicesFromSpec = Array.isArray(spec?.dynamicFlow?.services)
        ? spec.dynamicFlow.services
        : Array.isArray(spec?.booking?.services)
          ? spec.booking.services
          : null
      
      // Se não encontrou no spec, tenta extrair do flow_json (__example__)
      if (!servicesFromSpec && flowJsonObj) {
        const screens = Array.isArray((flowJsonObj as any)?.screens) ? (flowJsonObj as any).screens : []
        for (const screen of screens) {
          const dataSchema = screen?.data
          if (dataSchema && typeof dataSchema === 'object') {
            const servicesSchema = (dataSchema as any).services
            if (servicesSchema && Array.isArray(servicesSchema.__example__)) {
              servicesFromSpec = servicesSchema.__example__
              console.log('[flows/[id]] Extraindo services de flow_json.__example__:', servicesFromSpec?.length)
              break
            }
          }
        }
      }
      
      const normalizedServices = Array.isArray(servicesFromSpec)
        ? servicesFromSpec
            .map((opt: any) => ({
              id: typeof opt?.id === 'string' ? opt.id.trim() : String(opt?.id ?? '').trim(),
              title: typeof opt?.title === 'string' ? opt.title.trim() : String(opt?.title ?? '').trim(),
              ...(typeof opt?.durationMinutes === 'number' ? { durationMinutes: opt.durationMinutes } : {}),
            }))
            .filter((opt) => opt.id && opt.title)
        : []
      const isBookingFlow = Array.isArray((flowJsonObj as any)?.screens)
        ? (flowJsonObj as any).screens.some((s: any) => String(s?.id || '') === 'BOOKING_START')
        : false
      if (isBookingFlow && normalizedServices.length > 0) {
        console.log('[flows/[id]] Salvando booking_services:', normalizedServices.length, 'serviços')
        await settingsDb.set('booking_services', JSON.stringify(normalizedServices))
      } else if (isBookingFlow) {
        console.log('[flows/[id]] Booking flow sem serviços para salvar')
      }
    } catch (err) {
      console.error('[flows/[id]] Erro ao sincronizar services:', err)
    }

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row) return NextResponse.json({ error: 'Flow não encontrado' }, { status: 404 })

    return NextResponse.json(row)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar flow'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const { error } = await supabase.from('flows').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 })
  }
}
