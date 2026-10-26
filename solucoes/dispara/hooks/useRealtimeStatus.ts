/**
 * Real-time Campaign Status Hook
 *
 * Provides automatic polling for campaign status updates.
 * Polls every 2 seconds while campaign is SENDING, stops when complete.
 * Usa refetchInterval do React Query em vez de setInterval manual.
 */

import { useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { campaignService } from '../services'
import { Campaign, CampaignStatus } from '../types'

interface UseRealtimeStatusOptions {
  /** Polling interval in milliseconds (default: 2000) */
  interval?: number
  /** Whether to enable polling (default: true) */
  enabled?: boolean
}

/**
 * Verifica se a campanha deve continuar sendo polled
 */
function shouldPollCampaign(campaign: Campaign | undefined, enabled: boolean): boolean {
  if (!campaign || !enabled) return false

  // NEVER poll completed campaigns
  if (campaign.status === CampaignStatus.COMPLETED) return false

  // NEVER poll failed campaigns
  if (campaign.status === CampaignStatus.FAILED) return false

  // NEVER poll paused campaigns
  if (campaign.status === CampaignStatus.PAUSED) return false

  // NEVER poll cancelled campaigns
  if (campaign.status === CampaignStatus.CANCELLED) return false

  // NEVER poll draft campaigns
  if (campaign.status === CampaignStatus.DRAFT) return false

  // Check if all messages have been processed (sent + failed + skipped >= recipients)
  const totalProcessed = (campaign.sent || 0) + (campaign.failed || 0) + (campaign.skipped || 0)
  const isComplete = totalProcessed >= (campaign.recipients || 0)

  // If all processed, don't poll (even if status hasn't updated yet)
  if (isComplete && campaign.recipients > 0) return false

  // Only poll for active sending campaigns
  return campaign.status === CampaignStatus.SENDING
}

/**
 * Hook for real-time campaign status updates
 *
 * @param campaignId - The campaign ID to monitor
 * @param options - Configuration options
 * @returns Campaign data and status
 */
export const useRealtimeStatus = (
  campaignId: string | undefined,
  options: UseRealtimeStatusOptions = {}
) => {
  const { interval = 2000, enabled = true } = options
  const queryClient = useQueryClient()
  const pollCountRef = useRef(0)

  // Função para atualizar stats no backend
  const updateStatsInBackground = useCallback(async () => {
    if (!campaignId) return

    try {
      // Atualiza stats com dados em tempo real vindos do backend
      await campaignService.updateStats(campaignId)
      pollCountRef.current++

      // Invalidate campaigns list
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    } catch (error) {
      console.error('Failed to update campaign stats:', error)
    }
  }, [campaignId, queryClient])

  // Main campaign query com refetchInterval automático
  const {
    data: campaign,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      // Chama updateStats antes de buscar os dados atualizados
      await updateStatsInBackground()
      return campaignService.getById(campaignId!)
    },
    enabled: !!campaignId && enabled && !campaignId.startsWith('temp_'),
    staleTime: 1000,
    refetchOnMount: 'always',
    // Usa função para determinar intervalo dinamicamente baseado no estado da campanha
    refetchInterval: (query) => {
      const campaignData = query.state.data
      return shouldPollCampaign(campaignData, enabled) ? interval : false
    },
  })

  // For temp campaigns, use cached data directly
  const cachedCampaign = queryClient.getQueryData<Campaign>(['campaign', campaignId])

  const isPolling = shouldPollCampaign(campaign, enabled)

  return {
    campaign: campaign || cachedCampaign,
    isLoading: campaignId?.startsWith('temp_') ? false : isLoading,
    error,
    refetch,
    isPolling,
    pollCount: pollCountRef.current,
  }
}

/**
 * Hook for monitoring multiple campaigns (dashboard use case)
 * Usa refetchInterval do React Query em vez de setInterval manual.
 */
export const useRealtimeCampaigns = (options: UseRealtimeStatusOptions = {}) => {
  const { interval = 5000, enabled = true } = options
  const queryClient = useQueryClient()

  const {
    data: campaigns,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const allCampaigns = await campaignService.getAll()

      // Update stats for active campaigns in parallel
      const activeCampaigns = allCampaigns.filter(
        (c) => c.status === CampaignStatus.SENDING || c.status === CampaignStatus.SCHEDULED
      )

      if (activeCampaigns.length > 0) {
        await Promise.all(activeCampaigns.map((c) => campaignService.updateStats(c.id)))
      }

      return allCampaigns
    },
    enabled,
    staleTime: 2000,
    // Polling condicional: só faz refetch se houver campanhas ativas
    refetchInterval: (query) => {
      const campaignsData = query.state.data || []
      const hasActiveCampaigns = campaignsData.some(
        (c) => c.status === CampaignStatus.SENDING || c.status === CampaignStatus.SCHEDULED
      )
      return hasActiveCampaigns ? interval : false
    },
  })

  // Find active campaigns
  const activeCampaigns =
    campaigns?.filter(
      (c) => c.status === CampaignStatus.SENDING || c.status === CampaignStatus.SCHEDULED
    ) || []

  return {
    campaigns: campaigns || [],
    activeCampaigns,
    isLoading,
    error,
    refetch,
  }
}
