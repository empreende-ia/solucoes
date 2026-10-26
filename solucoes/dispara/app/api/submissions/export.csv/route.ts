import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/submissions/export.csv
 * Exporta submissões em CSV com dados limpos (sem JSON raw)
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const campaignId = url.searchParams.get('campaignId') || ''
    const flowId = url.searchParams.get('flowId') || ''
    const search = url.searchParams.get('search') || ''

    // Query com JOINs
    let query = supabase
      .from('flow_submissions')
      .select(
        `
        id,
        from_phone,
        response_json,
        created_at,
        contact:contacts(name, email),
        campaign:campaigns(name)
        `
      )
      .order('created_at', { ascending: false })
      .limit(5000) // Limite razoável para export

    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }

    if (flowId) {
      query = query.ilike('flow_token', `%${flowId}%`)
    }

    if (search) {
      query = query.ilike('from_phone', `%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return new NextResponse('Nenhuma submissão encontrada', { status: 404 })
    }

    // Coletar todos os campos únicos de formulário
    const allFormFields = new Set<string>()
    for (const row of data) {
      const json = row.response_json as Record<string, unknown> | null
      if (json) {
        for (const key of Object.keys(json)) {
          if (key !== 'flow_token') {
            allFormFields.add(key)
          }
        }
      }
    }
    const formFieldsArray = Array.from(allFormFields).sort()

    // Montar cabeçalho
    const headers = [
      'Data',
      'Nome',
      'Telefone',
      'Email',
      'Campanha',
      ...formFieldsArray.map(formatFieldLabel),
    ]

    // Montar linhas
    const rows: string[][] = []
    for (const row of data) {
      // Supabase pode retornar array ou objeto único dependendo da relação
      const contactRaw = row.contact as unknown
      const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
      const campaignRaw = row.campaign as unknown
      const campaign = Array.isArray(campaignRaw) ? campaignRaw[0] : campaignRaw
      const json = row.response_json as Record<string, unknown> | null

      const createdAt = new Date(row.created_at)
      // Formato BR manual (toLocaleDateString pode não funcionar no servidor)
      const day = String(createdAt.getDate()).padStart(2, '0')
      const month = String(createdAt.getMonth() + 1).padStart(2, '0')
      const year = createdAt.getFullYear()
      const hours = String(createdAt.getHours()).padStart(2, '0')
      const minutes = String(createdAt.getMinutes()).padStart(2, '0')
      const dateStr = `${day}/${month}/${year} ${hours}:${minutes}`

      // Extrai valores de forma segura
      const contactName = contact && typeof contact === 'object' && 'name' in contact ? (contact as { name: string | null }).name : null
      const contactEmail = contact && typeof contact === 'object' && 'email' in contact ? (contact as { email: string | null }).email : null
      const campaignName = campaign && typeof campaign === 'object' && 'name' in campaign ? (campaign as { name: string | null }).name : null

      const rowData = [
        dateStr,
        contactName || '',
        formatPhone(row.from_phone),
        contactEmail || '',
        campaignName || '',
        ...formFieldsArray.map((field) => formatFieldValue(json?.[field])),
      ]
      rows.push(rowData)
    }

    // Gerar CSV
    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n')

    // Nome do arquivo
    const timestamp = new Date().toISOString().slice(0, 10)
    const filename = campaignId
      ? `submissoes-campanha-${timestamp}.csv`
      : flowId
        ? `submissoes-flow-${timestamp}.csv`
        : `submissoes-${timestamp}.csv`

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao exportar submissões'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    const ddd = cleaned.slice(2, 4)
    const part1 = cleaned.slice(4, 9)
    const part2 = cleaned.slice(9)
    return `+55 ${ddd} ${part1}-${part2}`
  }
  return phone
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
