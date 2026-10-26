import { supabase } from '@/lib/supabase'
import { DashboardStats, ChartDataPoint } from '@/services/dashboardService'
import { getCampaignsServer } from './campaigns'

export async function getDashboardStatsServer(): Promise<{ stats: DashboardStats, recentCampaigns: any[] }> {
    // Parallel fetch stats source data and recent campaigns
    const [statsData, campaignsResult] = await Promise.all([
        supabase.from('campaigns').select('sent, delivered, read, failed, status'),
        getCampaignsServer({ limit: 7, offset: 0 })
    ])

    // --- Aggregate Stats ---
    const { data, error } = statsData
    if (error) {
        console.error('Error fetching dashboard stats:', error)
        // Return empty/safe defaults
        return {
            stats: {
                sent24h: '0',
                deliveryRate: '0%',
                activeCampaigns: '0',
                failedMessages: '0',
                chartData: []
            },
            recentCampaigns: []
        }
    }

    let totalSent = 0
    let totalDelivered = 0
    // let totalRead = 0 // Unused in summary but used in chart
    let totalFailed = 0
    let activeCampaignsCount = 0

        ; (data || []).forEach(row => {
            totalSent += row.sent || 0
            totalDelivered += row.delivered || 0
            // totalRead += row.read || 0
            totalFailed += row.failed || 0
            if (row.status === 'Enviando' || row.status === 'Agendado') {
                activeCampaignsCount++
            }
        })

    const deliveryRate = totalSent > 0
        ? Math.round((totalDelivered / totalSent) * 100)
        : 0

    const campaigns = campaignsResult.data || []

    // --- Chart Data ---
    // Based on recent campaigns
    const recentCampaigns = campaigns.slice(0, 5)

    const chartData: ChartDataPoint[] = campaigns.slice(0, 7).map(c => ({
        name: c.name?.substring(0, 3) || '?',
        sent: c.sent || c.recipients || 0,
        read: c.read || 0,
        delivered: c.delivered || 0,
        failed: c.failed || 0,
        active: c.status === 'Enviando' || c.status === 'Agendado' ? 1 : 0
    })).reverse()

    return {
        stats: {
            sent24h: totalSent.toLocaleString(),
            deliveryRate: `${deliveryRate}%`,
            activeCampaigns: activeCampaignsCount.toString(),
            failedMessages: totalFailed.toString(),
            chartData
        },
        recentCampaigns
    }
}
