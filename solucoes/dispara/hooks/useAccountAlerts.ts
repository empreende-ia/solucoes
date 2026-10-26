import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AccountAlert } from '@/app/api/account/alerts/route'
import { subscribeToDbChanges } from '@/lib/supabase-realtime'
import { createRealtimeInvalidator } from '@/lib/realtime-invalidation'

interface AlertsResponse {
  alerts: AccountAlert[]
  error?: string
}

async function fetchAlerts(): Promise<AlertsResponse> {
  const response = await fetch('/api/account/alerts', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Falha ao carregar alertas')
  }
  return response.json()
}

async function dismissAlert(alertId: string): Promise<void> {
  const response = await fetch(`/api/account/alerts?id=${alertId}`, {
    method: 'DELETE'
  })
  if (!response.ok) {
    throw new Error('Falha ao dispensar alerta')
  }
}

async function dismissAllAlerts(): Promise<void> {
  const response = await fetch('/api/account/alerts?all=true', {
    method: 'DELETE'
  })
  if (!response.ok) {
    throw new Error('Falha ao dispensar alertas')
  }
}

export function useAccountAlerts() {
  const queryClient = useQueryClient()

  // Realtime: mantém o banner/alertas em sincronia sem depender apenas de polling.
  // O broadcast `dispara-db` traz só id/type/code/dismissed (sem message/details) e o
  // canal é público, então o evento só dispara um refetch pela API autenticada —
  // com limite de taxa (debounce + maxWait, sem cancelar o fetch em curso): um flood
  // de eventos forjados não vira um GET /api/account/alerts por evento.
  useEffect(() => {
    const invalidator = createRealtimeInvalidator(queryClient)
    const unsubscribe = subscribeToDbChanges(
      () => {
        invalidator.invalidate(['account-alerts'])
      },
      { table: 'account_alerts' }
    )
    return () => {
      unsubscribe()
      invalidator.cancel()
    }
  }, [queryClient])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['account-alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 60000, // Poll every 60 seconds (optimized)
    staleTime: 30000, // Keep data fresh for 30s
    refetchOnMount: false, // Don't refetch on mount if data is fresh
    refetchOnWindowFocus: false, // Don't refetch on focus to reduce load
  })

  const dismissMutation = useMutation({
    mutationFn: dismissAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-alerts'] })
    }
  })

  const dismissAllMutation = useMutation({
    mutationFn: dismissAllAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-alerts'] })
    }
  })

  const alerts = data?.alerts || []

  // Group alerts by type for UI organization (memoized to avoid recalculating on every render)
  const { paymentAlerts, authAlerts, templateAlerts, systemAlerts, rateLimitAlerts } = useMemo(() => ({
    paymentAlerts: alerts.filter(a => a.type === 'payment'),
    authAlerts: alerts.filter(a => a.type === 'auth'),
    templateAlerts: alerts.filter(a => a.type === 'template'),
    systemAlerts: alerts.filter(a => a.type === 'system'),
    rateLimitAlerts: alerts.filter(a => a.type === 'rate_limit'),
  }), [alerts])

  // Get most critical alert for banner display (memoized)
  const criticalAlert = useMemo(() => paymentAlerts[0] || authAlerts[0] || null, [paymentAlerts, authAlerts])

  return {
    // All alerts
    alerts,

    // Grouped alerts
    paymentAlerts,
    authAlerts,
    templateAlerts,
    systemAlerts,
    rateLimitAlerts,

    // Most critical for banner
    criticalAlert,
    hasCriticalAlert: !!criticalAlert,

    // State
    isLoading,
    error,

    // Actions
    dismiss: (id: string) => dismissMutation.mutate(id),
    dismissAll: () => dismissAllMutation.mutate(),
    refetch,

    // Mutation states
    isDismissing: dismissMutation.isPending,
  }
}
