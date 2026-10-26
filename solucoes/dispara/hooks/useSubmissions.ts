'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { submissionsService, SubmissionsListParams, FlowSubmission } from '@/services/submissionsService'

export interface SubmissionsInitialData {
  submissions: FlowSubmission[]
  total: number
  page: number
  limit: number
}

export interface UseSubmissionsParams {
  campaignId?: string
  flowId?: string
  initialLimit?: number
  initialData?: SubmissionsInitialData
}

export function useSubmissionsController(params: UseSubmissionsParams = {}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [limit] = useState(params.initialLimit || 20)

  const queryParams: SubmissionsListParams = useMemo(
    () => ({
      limit,
      offset: page * limit,
      search: search.trim() || undefined,
      campaignId: params.campaignId,
      flowId: params.flowId,
    }),
    [limit, page, search, params.campaignId, params.flowId]
  )

  // Use initialData if provided (from server-side fetch)
  const queryInitialData = params.initialData && page === 0 && !search.trim()
    ? { data: params.initialData.submissions, total: params.initialData.total }
    : undefined

  const query = useQuery({
    queryKey: ['submissions', queryParams],
    queryFn: () => submissionsService.list(queryParams),
    initialData: queryInitialData,
    staleTime: 30_000, // 30 segundos
  })

  const submissions = query.data?.data || []
  const total = query.data?.total || 0
  const totalPages = Math.ceil(total / limit)

  // Estatísticas rápidas
  const stats = useMemo(() => {
    return {
      total,
      todayCount: submissions.filter((s) => {
        const created = new Date(s.created_at)
        const today = new Date()
        return created.toDateString() === today.toDateString()
      }).length,
    }
  }, [submissions, total])

  return {
    // Data
    submissions,
    total,
    stats,

    // Pagination
    page,
    setPage,
    limit,
    totalPages,
    hasNextPage: page < totalPages - 1,
    hasPrevPage: page > 0,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages - 1)),
    prevPage: () => setPage((p) => Math.max(p - 1, 0)),

    // Search
    search,
    setSearch,

    // Query state
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    // Helpers
    extractFormFields: submissionsService.extractFormFields,
    formatPhone: submissionsService.formatPhone,
  }
}

export type SubmissionsController = ReturnType<typeof useSubmissionsController>
