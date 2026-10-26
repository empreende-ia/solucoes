import { NextRequest, NextResponse } from 'next/server'
import { templateDb } from '@/lib/supabase-db'
import { precheckContactForTemplate } from '@/lib/whatsapp/template-contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PrecheckContact {
  contactId?: string
  contact_id?: string
  phone: string
  name?: string
  email?: string | null
  custom_fields?: Record<string, unknown>
}

/**
 * POST `/api/campaign/precheck`
 *
 * Executa um "dry-run" (pré-validação) do disparo de campanha:
 * - valida existência do template no banco local;
 * - valida e normaliza telefones;
 * - verifica variáveis obrigatórias do template (contrato) para cada contato;
 *
 * Não persiste dados e não envia mensagens — serve apenas para feedback rápido na UI.
 *
 * @param request Requisição Next.js contendo JSON com `templateName`, `contacts` e `templateVariables`.
 * @returns `NextResponse.json` com `{ ok, templateName, totals, results }` em caso de sucesso;
 * ou erro com status 400/500.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const templateName = String(body?.templateName || '').trim()
    const contacts = (body?.contacts || []) as PrecheckContact[]
    const templateVariables = body?.templateVariables as any

    if (!templateName) {
      return NextResponse.json({ error: 'templateName é obrigatório' }, { status: 400 })
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'contacts é obrigatório' }, { status: 400 })
    }

    const template = await templateDb.getByName(templateName)
    if (!template) {
      return NextResponse.json(
        { error: 'Template não encontrado no banco local. Sincronize Templates antes de validar.' },
        { status: 400 }
      )
    }

    const results = contacts.map((c) => {
      const contactId = c.contactId || c.contact_id || null
      const precheck = precheckContactForTemplate(
        {
          contactId,
          phone: c.phone,
          name: c.name,
          email: c.email,
          custom_fields: c.custom_fields,
        },
        template as any,
        templateVariables
      )

      if (precheck.ok) {
        return {
          ok: true as const,
          contactId: contactId || undefined,
          name: c.name || c.phone,
          phone: c.phone,
          normalizedPhone: precheck.normalizedPhone,
        }
      }

      return {
        ok: false as const,
        contactId: contactId || undefined,
        name: c.name || c.phone,
        phone: c.phone,
        normalizedPhone: precheck.normalizedPhone,
        skipCode: precheck.skipCode,
        reason: precheck.reason,
        missing: precheck.missing,
      }
    })

    const totals = {
      total: results.length,
      valid: results.filter(r => r.ok).length,
      skipped: results.filter(r => !r.ok).length,
    }

    return NextResponse.json(
      {
        ok: true,
        templateName,
        totals,
        results,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch (error) {
    console.error('[Precheck] Failed:', error)
    return NextResponse.json(
      { error: 'Falha ao validar destinatários', details: (error as Error)?.message },
      { status: 500 }
    )
  }
}
