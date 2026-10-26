import { useQuery } from '@tanstack/react-query'

/**
 * Hook for infrastructure usage metrics.
 * Uses the consolidated /api/system endpoint.
 */

interface UsageData {
  vercel: {
    functionInvocations: number
    functionLimit: number
    functionPercentage: number
    edgeRequests: number
    edgeLimit: number
    edgePercentage: number
    buildMinutes: number
    buildLimit: number
    buildPercentage: number
    percentage: number
    status: 'ok' | 'warning' | 'critical'
  }
  database: {
    storageMB: number
    limitMB: number
    percentage: number
    status: 'ok' | 'warning' | 'critical'
  }
  whatsapp: {
    messagesSent: number
    tier: string
    tierLimit: number
    percentage: number
    quality: string
    status: 'ok' | 'warning' | 'critical'
  }
}

interface SystemResponse {
  health: unknown
  usage: UsageData
  vercel: unknown
  timestamp: string
}

export const useUsage = () => {
  // Use the consolidated system endpoint
  const query = useQuery<SystemResponse>({
    queryKey: ['systemStatus'],
    queryFn: async () => {
      // Add timestamp to bypass Vercel/Next.js edge cache
      const response = await fetch(`/api/system?t=${Date.now()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch system status')
      }
      return response.json()
    },
    staleTime: 60000, // Cache for 1 minute
    // No polling - fetch once when component mounts
  })

  return {
    usage: query.data?.usage || null,
    timestamp: query.data?.timestamp,
    isLoading: query.isLoading || query.isRefetching,
    isError: query.isError,
    refetch: query.refetch,
  }
}
