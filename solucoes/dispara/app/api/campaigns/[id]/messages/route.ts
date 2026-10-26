import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { MessageStatus } from '@/types'

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * GET /api/campaigns/[id]/messages
 * Get messages for a campaign with pagination and aggregated stats
 * 
 * Query params:
 * - limit: number of messages per page (default: 50, max: 100)
 * - offset: pagination offset (default: 0)
 * - status: filter by status (optional)
 * - includeRead: quando status=DELIVERED, inclui status=read (optional)
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)

    // Pagination params
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')
    const statusFilter = searchParams.get('status')
    const includeReadRaw = searchParams.get('includeRead')
    const includeRead = includeReadRaw === '1' || includeReadRaw === 'true'

    // 1. Get aggregated stats (single RPC call instead of 7 queries)
    const { data: statsData, error: statsError } = await supabase.rpc('get_campaign_contact_stats', {
      p_campaign_id: id
    })

    if (statsError) {
      console.error('Failed to get campaign stats:', statsError)
      throw statsError
    }

    const aggregatedStats = {
      total: statsData?.total || 0,
      pending: statsData?.pending || 0,
      sent: statsData?.sent || 0,
      delivered: statsData?.delivered || 0,
      read: statsData?.read || 0,
      skipped: statsData?.skipped || 0,
      failed: statsData?.failed || 0,
    }

    // 2. Get paginated messages
    let query = supabase
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', id)

    if (statusFilter) {
      if (statusFilter === MessageStatus.SENT) {
        // "Enviado" = efetivamente disparado (exclui pending e skipped)
        query = query.in('status', ['sent', 'delivered', 'read', 'failed'])
      } else if (statusFilter === MessageStatus.DELIVERED) {
        // "Entregues" (status atual) = delivered (não inclui read) por padrão.
        // Quando includeRead=true, vira uma visão cumulativa (delivered + read).
        query = includeRead
          ? query.in('status', ['delivered', 'read'])
          : query.eq('status', 'delivered')
      } else if (statusFilter === MessageStatus.READ) {
        query = query.eq('status', 'read')
      } else if (statusFilter === MessageStatus.SKIPPED) {
        query = query.eq('status', 'skipped')
      } else if (statusFilter === MessageStatus.FAILED) {
        query = query.eq('status', 'failed')
      }
    }

    const { data: rows, error } = await query
      // Sort logic: Show Undelivered (Null delivered_at) first to highlight potential issues/gaps
      .order('delivered_at', { ascending: true, nullsFirst: true })
      .order('sent_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const messages = (rows || []).map((row, index) => {
      // Map database status to MessageStatus enum
      let status = MessageStatus.PENDING
      const dbStatus = row.status as string

      if (dbStatus === 'sent') status = MessageStatus.SENT
      else if (dbStatus === 'delivered') status = MessageStatus.DELIVERED
      else if (dbStatus === 'read') status = MessageStatus.READ
      else if (dbStatus === 'sending') status = MessageStatus.PENDING
      else if (dbStatus === 'skipped') status = MessageStatus.SKIPPED
      else if (dbStatus === 'failed') status = MessageStatus.FAILED

      return {
        id: row.id as string || `msg_${id}_${offset + index}`,
        campaignId: id,
        contactId: (row.contact_id as string | null) || undefined,
        contactName: row.name as string || row.phone as string,
        contactPhone: row.phone as string,
        status,
        messageId: row.message_id as string | undefined,
        sentAt: row.sent_at ? new Date(row.sent_at as string).toLocaleString('pt-BR') : '-',
        deliveredAt: row.delivered_at ? new Date(row.delivered_at as string).toLocaleString('pt-BR') : undefined,
        readAt: row.read_at ? new Date(row.read_at as string).toLocaleString('pt-BR') : undefined,
        failureCode: (row.failure_code as number | null) || undefined,
        failureTitle: (row.failure_title as string | null) || undefined,
        failureDetails: (row.failure_details as string | null) || undefined,
        failureFbtraceId: (row.failure_fbtrace_id as string | null) || undefined,
        failureSubcode: (row.failure_subcode as number | null) || undefined,
        failureHref: (row.failure_href as string | null) || undefined,
        error: (
          // Para skipped, o motivo vem do nosso pré-check/guard-rail
          (status === MessageStatus.SKIPPED ? (row.skip_reason || row.skip_code) : undefined) ||
          row.failure_reason ||
          row.error ||
          row.error_message ||
          (status === MessageStatus.SENT ? 'Aguardando confirmação de entrega...' : undefined)
        ) as string | undefined,
      }
    })

    // Return paginated response with stats (no cache for real-time data)
    return NextResponse.json({
      messages,
      stats: aggregatedStats,
      pagination: {
        limit,
        offset,
        total: aggregatedStats.total,
        hasMore: offset + messages.length < aggregatedStats.total,
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (error) {
    console.error('Failed to fetch campaign messages:', error)
    return NextResponse.json(
      { error: 'Falha ao buscar mensagens', details: (error as Error).message },
      { status: 500 }
    )
  }
}
