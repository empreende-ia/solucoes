import { NextResponse } from 'next/server'
import { leadFormDb, contactDb } from '@/lib/supabase-db'
import { SubmitLeadFormSchema, validateBody, formatZodErrors } from '@/lib/api-validation'
import { processPhoneNumber } from '@/lib/phone-formatter'
import { ContactStatus } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Params = { params: Promise<{ slug: string }> }

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

/**
 * POST /api/public/lead-forms/[slug]/submit
 * Submete dados do formulário e cria/atualiza contato com a tag do formulário
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params
    const form = await leadFormDb.getBySlug(slug)

    if (!form) {
      return NextResponse.json(
        { error: 'Formulário não encontrado' },
        { status: 404, headers: corsHeaders() }
      )
    }

    if (!form.isActive) {
      return NextResponse.json(
        { error: 'Formulário desativado', isActive: false },
        { status: 403, headers: corsHeaders() }
      )
    }

    const body = await request.json().catch(() => ({}))
    const validation = validateBody(SubmitLeadFormSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400, headers: corsHeaders() }
      )
    }

    const { name, phone, email, custom_fields } = validation.data

    const { normalized, validation: phoneValidation } = processPhoneNumber(phone)
    if (!phoneValidation.isValid) {
      return NextResponse.json(
        { error: phoneValidation.error || 'Número de telefone inválido' },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Validação dos campos customizados conforme schema do formulário
    const fields = (form.fields || []) as Array<any>

    const normalizedCustomFields: Record<string, any> = {}
    for (const f of fields) {
      const key = String(f?.key || '').trim()
      if (!key) continue

      const type = String(f?.type || 'text')
      const required = !!f?.required
      const raw = (custom_fields || {})[key]

      if (required && (raw === undefined || raw === null || String(raw).trim() === '')) {
        return NextResponse.json(
          { error: `Campo obrigatório: ${f?.label || key}` },
          { status: 400, headers: corsHeaders() }
        )
      }

      if (raw === undefined || raw === null || String(raw).trim() === '') {
        continue
      }

      if (type === 'number') {
        const n = Number(raw)
        if (Number.isNaN(n)) {
          return NextResponse.json(
            { error: `Campo inválido: ${f?.label || key} deve ser número` },
            { status: 400, headers: corsHeaders() }
          )
        }
        normalizedCustomFields[key] = n
        continue
      }

      if (type === 'date') {
        const d = new Date(String(raw))
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { error: `Campo inválido: ${f?.label || key} deve ser uma data` },
            { status: 400, headers: corsHeaders() }
          )
        }
        // salva ISO (mais consistente para filtros/relatórios)
        normalizedCustomFields[key] = d.toISOString()
        continue
      }

      if (type === 'select') {
        const v = String(raw).trim()
        const opts = Array.isArray(f?.options) ? f.options.map((x: any) => String(x)) : []
        if (opts.length > 0 && !opts.includes(v)) {
          return NextResponse.json(
            { error: `Campo inválido: ${f?.label || key}` },
            { status: 400, headers: corsHeaders() }
          )
        }
        normalizedCustomFields[key] = v
        continue
      }

      // text (default)
      normalizedCustomFields[key] = String(raw)
    }

    const createdOrUpdated = await contactDb.upsertMergeTagsByPhone(
      {
        name,
        phone: normalized,
        email: (form.collectEmail ?? true) ? (email ?? undefined) : undefined,
        status: ContactStatus.OPT_IN,
        tags: [],
        custom_fields: normalizedCustomFields,
      },
      [form.tag]
    )

    return NextResponse.json(
      {
        success: true,
        message: form.successMessage || 'Cadastro recebido! Obrigado.',
        contactId: createdOrUpdated.id,
      },
      { status: 201, headers: corsHeaders() }
    )
  } catch (error: any) {
    console.error('Failed to submit lead form:', error)
    return NextResponse.json(
      { error: 'Falha ao enviar formulário', details: String(error?.message || '') },
      { status: 500, headers: corsHeaders() }
    )
  }
}
