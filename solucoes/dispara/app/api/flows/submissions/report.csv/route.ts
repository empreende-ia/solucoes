import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// CSV header columns - extracted to constant to avoid duplication
const CSV_HEADER = [
  'message_id',
  'campaign_id',
  'flow_id',
  'flow_name',
  'flow_token',
  'flow_local_id',
  'from_phone',
  'contact_id',
  'message_timestamp',
  'created_at',
  'phone_number_id',
  'waba_id',
  'response_json_raw',
  'response_json',
  'mapped_data',
  'mapped_at',
] as const

const csvEscape = (value: unknown) => {
  const s = value === null || value === undefined ? '' : String(value)
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

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const anyErr = error as any
  const msg = typeof anyErr.message === 'string' ? anyErr.message : ''
  return anyErr.code === 'PGRST205' || /could not find the table/i.test(msg)
}

function isMissingColumn(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false
  const anyErr = error as any
  const msg = typeof anyErr.message === 'string' ? anyErr.message : ''
  return msg.toLowerCase().includes('column') && msg.toLowerCase().includes(column.toLowerCase())
}

async function resolveCampaignName(campaignId: string | null): Promise<string | null> {
  if (!campaignId) return null
  try {
    const { data } = await supabase.from('campaigns').select('name').eq('id', campaignId).limit(1)
    return data?.[0]?.name ? String(data[0].name) : null
  } catch {
    return null
  }
}

async function resolveFlowName(flowId: string | null): Promise<string | null> {
  if (!flowId) return null
  try {
    const { data } = await supabase.from('flows').select('name').eq('meta_flow_id', flowId).limit(1)
    return data?.[0]?.name ? String(data[0].name) : null
  } catch {
    return null
  }
}

/**
 * GET /api/flows/submissions/report.csv
 * Query params:
 * - flowId (meta flow id)
 * - campaignId
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const flowId = searchParams.get('flowId')
    const campaignId = searchParams.get('campaignId')

    if (!flowId && !campaignId) {
      return new Response('Informe flowId ou campaignId', { status: 400 })
    }

    let q = supabase
      .from('flow_submissions')
      .select('*')
      .order('created_at', { ascending: false })

    if (flowId) q = q.eq('flow_id', flowId)
    if (campaignId) q = q.eq('campaign_id', campaignId)

    const { data, error } = await q
    if (error) {
      if (campaignId && isMissingColumn(error, 'campaign_id')) {
        const csv = `\ufeff${CSV_HEADER.join(',')}\n`
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="flow_submissions.csv"',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
            'X-Warning': 'flow_submissions_campaign_id_missing',
          },
        })
      }
      throw error
    }

    const rows = Array.isArray(data) ? data : []

    const lines = [CSV_HEADER.join(',')]
    for (const row of rows) {
      lines.push(
        [
          csvEscape((row as any).message_id),
          csvEscape((row as any).campaign_id),
          csvEscape((row as any).flow_id),
          csvEscape((row as any).flow_name),
          csvEscape((row as any).flow_token),
          csvEscape((row as any).flow_local_id),
          csvEscape((row as any).from_phone),
          csvEscape((row as any).contact_id),
          csvEscape((row as any).message_timestamp),
          csvEscape((row as any).created_at),
          csvEscape((row as any).phone_number_id),
          csvEscape((row as any).waba_id),
          csvEscape((row as any).response_json_raw),
          csvEscape(
            (row as any).response_json && typeof (row as any).response_json === 'string'
              ? (row as any).response_json
              : JSON.stringify((row as any).response_json ?? null)
          ),
          csvEscape(
            (row as any).mapped_data && typeof (row as any).mapped_data === 'string'
              ? (row as any).mapped_data
              : JSON.stringify((row as any).mapped_data ?? null)
          ),
          csvEscape((row as any).mapped_at),
        ].join(',')
      )
    }

    const csv = `\ufeff${lines.join('\n')}\n`

    const resolvedCampaignName = await resolveCampaignName(campaignId)
    const resolvedFlowName = await resolveFlowName(flowId)
    const fallbackFlowName = rows[0]?.flow_name ? String(rows[0].flow_name) : null

    const nameBase =
      safeFilename(resolvedCampaignName || '') ||
      safeFilename(resolvedFlowName || '') ||
      safeFilename(fallbackFlowName || '') ||
      (campaignId ? `campanha_${safeFilename(campaignId)}` : '') ||
      (flowId ? `miniapp_${safeFilename(flowId)}` : '') ||
      'flow_submissions'

    const filename = `${nameBase}_submissoes.csv`

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
    console.error('[flow submissions csv] Failed to generate report:', err)

    if (isMissingTable(err)) {
      const csv = `\ufeff${CSV_HEADER.join(',')}\n`
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="flow_submissions.csv"',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
          'X-Warning': 'flow_submissions_missing',
        },
      })
    }

    return new Response('Falha ao gerar relatório CSV', { status: 500 })
  }
}
