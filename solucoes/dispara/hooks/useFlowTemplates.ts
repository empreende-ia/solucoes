import { useQuery } from '@tanstack/react-query'
import { flowTemplatesService } from '@/services/flowTemplatesService'

export function useFlowTemplates() {
  return useQuery({
    queryKey: ['flow-templates'],
    queryFn: flowTemplatesService.list,
    staleTime: 60_000,
  })
}
