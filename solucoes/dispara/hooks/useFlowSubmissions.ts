import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { flowSubmissionsService, FlowSubmissionRow } from '@/services/flowSubmissionsService'

export const useFlowSubmissionsController = () => {
  const [phoneFilter, setPhoneFilter] = useState('')
  const [flowIdFilter, setFlowIdFilter] = useState('')

  const submissionsQuery = useQuery({
    queryKey: ['flowSubmissions', { phoneFilter, flowIdFilter }],
    queryFn: () =>
      flowSubmissionsService.list({
        limit: 100,
        phone: phoneFilter.trim() || undefined,
        flowId: flowIdFilter.trim() || undefined,
      }),
    staleTime: 10_000,
  })

  const submissions = useMemo<FlowSubmissionRow[]>(() => submissionsQuery.data || [], [submissionsQuery.data])

  return {
    submissions,
    isLoading: submissionsQuery.isLoading,
    isFetching: submissionsQuery.isFetching,
    error: submissionsQuery.error as Error | null,
    refetch: submissionsQuery.refetch,

    phoneFilter,
    setPhoneFilter,
    flowIdFilter,
    setFlowIdFilter,
  }
}
