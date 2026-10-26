import { NextResponse } from 'next/server'
import { campaignDb, campaignContactDb } from '@/lib/supabase-db'
import { CreateCampaignSchema, validateBody, formatZodErrors } from '@/lib/api-validation'

// Force dynamic - NO caching at all
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/campaigns
 * List all campaigns from Supabase (NO CACHE - always fresh)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const search = url.searchParams.get('search') || ''
    const status = url.searchParams.get('status') || ''
    const folderId = url.searchParams.get('folderId') || null  // null = todas, 'none' = sem pasta
    const tagIdsParam = url.searchParams.get('tagIds') || ''  // comma-separated
    const tagIds = tagIdsParam ? tagIdsParam.split(',').filter(Boolean) : null

    const wantsPaged =
      limitParam !== null ||
      offsetParam !== null ||
      search.length > 0 ||
      status.length > 0 ||
      folderId !== null ||
      tagIds !== null

    if (wantsPaged) {
      const limitRaw = Number(limitParam)
      const offsetRaw = Number(offsetParam)
      const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20))
      const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0)

      const result = await campaignDb.list({
        limit,
        offset,
        search,
        status,
        folderId,
        tagIds,
      })

      return NextResponse.json(
        { ...result, limit, offset },
        {
          headers: {
            // Disable ALL caching
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          }
        }
      )
    }

    const campaigns = await campaignDb.getAll()
    return NextResponse.json(campaigns, {
      headers: {
        // Disable ALL caching
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (error) {
    console.error('Failed to fetch campaigns:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar campanhas' },
      { status: 500 }
    )
  }
}

interface CreateCampaignBody {
  name: string
  templateName: string
  recipients: number
  scheduledAt?: string
  selectedContactIds?: string[]
  contacts?: { name: string; phone: string; email?: string | null; custom_fields?: Record<string, unknown> }[]
  // Meta API structure:
  // - header: text variables for templates with TEXT header
  // - headerMediaId: media ID for templates with MEDIA header (image/document/video)
  templateVariables?: { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> }
}

/**
 * POST /api/campaigns
 * Create a new campaign with contacts
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate input
    const validation = validateBody(CreateCampaignSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const data = validation.data

    // Create campaign with template variables
    const campaign = await campaignDb.create({
      name: data.name,
      templateName: data.templateName,
      recipients: data.recipients,
      scheduledAt: data.scheduledAt,
      templateVariables: data.templateVariables,  // Now properly validated by Zod
      flowId: data.flowId,  // Flow/MiniApp reference (se o template usar Flow)
      flowName: data.flowName,
      folderId: data.folderId,  // Organização por pasta
      abTestEnabled: data.abTestEnabled,
      abTemplateNameB: data.abTemplateNameB,
      abTemplateVariablesB: data.abTemplateVariablesB,
      abSplitRatio: data.abSplitRatio,
      quickReplyResponses: data.quickReplyResponses,
      fallbackResponse: data.fallbackResponse,
    })

    // If contacts were provided, add them to campaign_contacts
    if (data.contacts && data.contacts.length > 0) {
      // A/B Testing: assign variant based on split ratio
      const abEnabled = data.abTestEnabled === true
      const splitRatio = data.abSplitRatio ?? 50 // percentage for variant A

      await campaignContactDb.addContacts(
        campaign.id,
        data.contacts.map((c) => ({
          contactId: c.contactId || c.id || (c as any).contact_id,
          phone: c.phone,
          name: c.name || '',
          email: c.email || null,
          // Snapshot Pattern: persist custom fields at campaign creation time
          custom_fields: c.custom_fields || {},
          // A/B variant assignment: random based on split ratio
          variant: abEnabled ? (Math.random() * 100 < splitRatio ? 'A' : 'B') : 'A',
        }))
      )
    }

    // Agendamento (Fase C — migração QStash→pg_cron): nada a enfileirar aqui.
    // A campanha já foi criada com status=SCHEDULED + scheduled_date (campaignDb.create).
    // O relógio (pg_cron → /api/cron/tick → drainScheduledCampaigns) varre as campanhas
    // vencidas e dispara o /api/campaign/dispatch com trigger:'schedule'. O guard
    // isStillScheduled no dispatch continua protegendo contra disparo indevido.

    return NextResponse.json(campaign, { status: 201 })
  } catch (error) {
    console.error('Failed to create campaign:', error)
    return NextResponse.json(
      { error: 'Falha ao criar campanha' },
      { status: 500 }
    )
  }
}
