import { campaignDb } from '@/lib/supabase-db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

const csvEscape = (value: unknown) => {
  const s = value === null || value === undefined ? '' : String(value)
  // RFC4180-ish: quote when needed, double-escape quotes
  const needsQuotes = /[",\n\r]/.test(s)
  const escaped = s.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

const safeFilename = (value: string) => {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

/**
 * GET /api/campaigns/[id]/report.csv
 * Baixa um relatório CSV com os envios/estados por contato.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params

    const campaign = await campaignDb.getById(id)
    if (!campaign) {
      return new Response('Campanha não encontrada', { status: 404 })
    }

    // Relatório por destinatário (campaign_contacts)
    const { data, error } = await supabase
      .from('campaign_contacts')
      .select('contact_id,name,phone,email,status,message_id,sent_at,delivered_at,read_at,error')
      .eq('campaign_id', id)
      .order('sent_at', { ascending: false })

    // Em ambientes novos sem migrações completas, degradar para CSV vazio ao invés de 500.
    if (error) {
      const msg = String((error as any)?.message || '')
      const isMissingRelation = msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('does not exist')
      if (!isMissingRelation) throw error
    }

    const rows = Array.isArray(data) ? data : []

    const header = [
      'contact_id',
      'name',
      'phone',
      'email',
      'status',
      'message_id',
      'sent_at',
      'delivered_at',
      'read_at',
      'error',
    ]

    const lines = [header.join(',')]
    for (const row of rows) {
      lines.push(
        [
          csvEscape((row as any).contact_id),
          csvEscape((row as any).name),
          csvEscape((row as any).phone),
          csvEscape((row as any).email),
          csvEscape((row as any).status),
          csvEscape((row as any).message_id),
          csvEscape((row as any).sent_at),
          csvEscape((row as any).delivered_at),
          csvEscape((row as any).read_at),
          csvEscape((row as any).error),
        ].join(',')
      )
    }

    // BOM ajuda Excel/Sheets a reconhecer UTF-8
    const csv = `\ufeff${lines.join('\n')}\n`

    const filenameBase = safeFilename(campaign.name) || `campaign_${safeFilename(id)}`
    const filename = `${filenameBase}_relatorio.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (err) {
    console.error('[report.csv] Failed to generate report:', err)
    return new Response('Falha ao gerar relatório CSV', { status: 500 })
  }
}
