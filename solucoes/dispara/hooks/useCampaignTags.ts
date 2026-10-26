/**
 * useCampaignTags - Campaign tag management hook
 * Provides CRUD operations for campaign tags
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignService } from '@/services/campaignService'
import type { CampaignTag, CreateCampaignTagDTO } from '@/types'
import { CACHE } from '@/lib/constants'

const TAGS_KEY = ['campaign-tags']

// =============================================================================
// Tags Hook
// =============================================================================

export function useCampaignTags() {
  const queryClient = useQueryClient()

  // List query
  const tagsQuery = useQuery({
    queryKey: TAGS_KEY,
    queryFn: campaignService.listTags,
    staleTime: CACHE.campaigns,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: campaignService.createTag,
    onSuccess: (newTag) => {
      queryClient.setQueryData<CampaignTag[]>(TAGS_KEY, (old) =>
        old ? [...old, newTag].toSorted((a, b) => a.name.localeCompare(b.name)) : [newTag]
      )
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: campaignService.deleteTag,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TAGS_KEY })

      const previousTags = queryClient.getQueryData<CampaignTag[]>(TAGS_KEY)

      // Optimistic delete
      queryClient.setQueryData<CampaignTag[]>(TAGS_KEY, (old) =>
        old?.filter((tag) => tag.id !== id)
      )

      return { previousTags }
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousTags) {
        queryClient.setQueryData(TAGS_KEY, context.previousTags)
      }
    },
    onSuccess: () => {
      // Invalidate campaigns that might have this tag
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })

  return {
    tags: tagsQuery.data ?? [],
    isLoading: tagsQuery.isLoading,
    error: tagsQuery.error,

    create: createMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,

    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,

    refetch: tagsQuery.refetch,
  }
}

// =============================================================================
// Helper: Get tag by ID
// =============================================================================

export function useCampaignTagById(tagId: string | null) {
  const { tags, isLoading } = useCampaignTags()

  const tag = tagId ? tags.find((t) => t.id === tagId) : null

  return {
    tag,
    isLoading,
  }
}

// =============================================================================
// Preset Colors for Tags
// =============================================================================

export const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray (default)
] as const
