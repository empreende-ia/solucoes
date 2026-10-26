import { useQuery } from '@tanstack/react-query'

/**
 * Consolidated system status hook
 * 
 * Fetches health, usage, and Vercel info in a single API call,
 * reducing function invocations by ~66% compared to 3 separate calls.
 */

// === TYPES ===

interface HealthService {
  status: 'ok' | 'error' | 'not_configured'
  latency?: number
  message?: string
  source?: string
  phoneNumber?: string
}

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  services: {
    database: HealthService
    whatsapp: HealthService
  }
}

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

interface VercelInfo {
  dashboardUrl: string | null
  storesUrl: string | null
  env: string
}

interface SystemResponse {
  health: HealthStatus
  usage: UsageData
  vercel: VercelInfo
  timestamp: string
}

// === HOOK ===

export const useSystemStatus = () => {
  const query = useQuery<SystemResponse>({
    queryKey: ['systemStatus'],
    queryFn: async () => {
      const response = await fetch('/api/system')
      if (!response.ok) {
        throw new Error('Failed to fetch system status')
      }
      return response.json()
    },
    staleTime: 60 * 1000, // Cache for 1 minute
    // No polling - user can manually refresh
  })

  return {
    // Full data
    data: query.data,

    // Convenience accessors
    health: query.data?.health || null,
    usage: query.data?.usage || null,
    vercel: query.data?.vercel || null,
    timestamp: query.data?.timestamp,

    // Query state
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  }
}

// Re-export types for consumers
export type { HealthStatus, UsageData, VercelInfo, SystemResponse }
