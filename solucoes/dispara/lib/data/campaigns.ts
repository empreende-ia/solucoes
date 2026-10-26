import { supabase } from '@/lib/supabase'
import { CampaignStatus } from '@/types'
import type { CampaignListResult } from '@/services/campaignService'

export async function getCampaignsServer(params?: {
    limit?: number
    offset?: number
    search?: string
    status?: string
}): Promise<CampaignListResult> {
    const limit = Math.max(1, Math.min(100, Math.floor(params?.limit || 20)))
    const offset = Math.max(0, Math.floor(params?.offset || 0))
    const search = (params?.search || '').trim()
    const status = (params?.status || '').trim()

    let query = supabase
        .from('campaigns')
        .select('id,name,status,template_name,template_variables,total_recipients,sent,delivered,read,skipped,failed,created_at,scheduled_date,started_at,first_dispatch_at,last_sent_at,completed_at', { count: 'exact' })

    if (search) {
        const like = `%${search}%`
        query = query.or(`name.ilike.${like},template_name.ilike.${like}`)
    }

    if (status && status !== 'All') {
        query = query.eq('status', status)
    }

    const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

    if (error) {
        console.error('Error fetching campaigns:', error)
        return { data: [], total: 0, limit, offset }
    }

    return {
        data: (data || []).map(row => ({
            id: row.id,
            name: row.name,
            status: row.status as CampaignStatus,
            templateName: row.template_name,
            templateVariables: row.template_variables as { header: string[], headerMediaId?: string, body: string[], buttons?: Record<string, string> } | undefined,
            recipients: row.total_recipients,
            sent: row.sent,
            delivered: row.delivered,
            read: row.read,
            skipped: (row as any).skipped || 0,
            failed: row.failed,
            createdAt: row.created_at,
            scheduledAt: row.scheduled_date,
            startedAt: row.started_at,
            firstDispatchAt: (row as any).first_dispatch_at ?? null,
            lastSentAt: (row as any).last_sent_at ?? null,
            completedAt: row.completed_at,
        })),
        total: count || 0,
        limit,
        offset,
    }
}
