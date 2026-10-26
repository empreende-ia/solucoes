'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDashboardController } from '@/hooks/useDashboard'
import { DashboardView } from '@/components/features/dashboard/DashboardView'
import { campaignService } from '@/services/campaignService'
import { templateService } from '@/services/templateService'

const DEFAULT_STATS = {
    sent24h: '0',
    deliveryRate: '0%',
    activeCampaigns: '0',
    failedMessages: '0',
    chartData: []
}

export function DashboardClientWrapper({ initialData }: { initialData?: any }) {
    const { stats, recentCampaigns, isLoading } = useDashboardController(initialData)
    const queryClient = useQueryClient()

    // Prefetch outras páginas em background após o dashboard carregar
    useEffect(() => {
        if (!isLoading) {
            const timeout = setTimeout(() => {
                queryClient.prefetchQuery({
                    queryKey: ['campaigns', { page: 1, search: '', status: 'All' }],
                    queryFn: () => campaignService.list({ limit: 20, offset: 0, search: '', status: 'All' }),
                    staleTime: 30000,
                })
                queryClient.prefetchQuery({
                    queryKey: ['templates'],
                    queryFn: templateService.getAll,
                    staleTime: Infinity
                })
            }, 1000)

            return () => clearTimeout(timeout)
        }
    }, [isLoading, queryClient])

    // Não mostra loading se já temos initialData do servidor
    const showLoading = isLoading && !initialData

    return (
        <DashboardView
            stats={stats ?? DEFAULT_STATS}
            recentCampaigns={recentCampaigns ?? []}
            isLoading={showLoading}
        />
    )
}
