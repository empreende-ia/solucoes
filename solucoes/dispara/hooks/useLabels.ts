/**
 * T030: useLabels - Label management hook
 * Provides CRUD operations for inbox labels
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inboxService, type CreateLabelParams } from '@/services/inboxService'
import type { InboxLabel } from '@/types'
import { CACHE } from '@/lib/constants'

const LABELS_KEY = ['inbox-labels']

// =============================================================================
// Labels Hook
// =============================================================================

export interface UseLabelsOptions {
  initialData?: InboxLabel[]
}

export function useLabels(options: UseLabelsOptions = {}) {
  const queryClient = useQueryClient()

  // List query - labels rarely change, use longer staleTime
  const labelsQuery = useQuery({
    queryKey: LABELS_KEY,
    queryFn: inboxService.listLabels,
    initialData: options.initialData,
    staleTime: CACHE.labels,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: inboxService.createLabel,
    onSuccess: (newLabel) => {
      queryClient.setQueryData<InboxLabel[]>(LABELS_KEY, (old) =>
        old ? [...old, newLabel].sort((a, b) => a.name.localeCompare(b.name)) : [newLabel]
      )
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: inboxService.deleteLabel,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LABELS_KEY })

      const previousLabels = queryClient.getQueryData<InboxLabel[]>(LABELS_KEY)

      // Optimistic delete
      queryClient.setQueryData<InboxLabel[]>(LABELS_KEY, (old) =>
        old?.filter((label) => label.id !== id)
      )

      return { previousLabels }
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousLabels) {
        queryClient.setQueryData(LABELS_KEY, context.previousLabels)
      }
    },
    onSuccess: () => {
      // Invalidate conversations that might have this label
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
    },
  })

  return {
    labels: labelsQuery.data ?? [],
    isLoading: labelsQuery.isLoading,
    error: labelsQuery.error,

    create: createMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,

    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,

    refetch: labelsQuery.refetch,
  }
}

// =============================================================================
// Helper: Get label by ID
// =============================================================================

export function useLabelById(labelId: string | null) {
  const { labels, isLoading } = useLabels()

  const label = labelId ? labels.find((l) => l.id === labelId) : null

  return {
    label,
    isLoading,
  }
}
