'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { performanceService, SettingsPerformanceResponse } from '@/services/performanceService'

export function useSettingsPerformanceController() {
  const [rangeDays, setRangeDays] = React.useState<number>(30)
  const [selectedConfigHash, setSelectedConfigHash] = React.useState<string | null>(null)

  const query = useQuery<SettingsPerformanceResponse>({
    queryKey: ['settingsPerformance', rangeDays],
    queryFn: () => performanceService.getSettingsPerformance({ rangeDays, limit: 250 }),
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const runsAsc = React.useMemo(() => {
    const rows = query.data?.runs || []
    return [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  }, [query.data?.runs])

  const filteredRuns = React.useMemo(() => {
    if (!selectedConfigHash) return runsAsc
    return runsAsc.filter((r) => (r.config_hash || 'unknown') === selectedConfigHash)
  }, [runsAsc, selectedConfigHash])

  const configs = React.useMemo(() => query.data?.byConfig || [], [query.data?.byConfig])

  return {
    rangeDays,
    setRangeDays,
    selectedConfigHash,
    setSelectedConfigHash,

    data: query.data,
    runsAsc,
    filteredRuns,
    configs,

    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
