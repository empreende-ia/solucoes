/**
 * T031: useQuickReplies - Quick reply management hook
 * Provides CRUD operations for inbox quick replies
 */

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inboxService, type CreateQuickReplyParams } from '@/services/inboxService'
import type { InboxQuickReply } from '@/types'
import { CACHE } from '@/lib/constants'

const QUICK_REPLIES_KEY = ['inbox-quick-replies']

// =============================================================================
// Quick Replies Hook
// =============================================================================

export interface UseQuickRepliesOptions {
  initialData?: InboxQuickReply[]
}

export function useQuickReplies(options: UseQuickRepliesOptions = {}) {
  const queryClient = useQueryClient()

  // List query - quick replies rarely change, use longer staleTime
  const quickRepliesQuery = useQuery({
    queryKey: QUICK_REPLIES_KEY,
    queryFn: inboxService.listQuickReplies,
    initialData: options.initialData,
    staleTime: CACHE.quickReplies,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: inboxService.createQuickReply,
    onSuccess: (newQuickReply) => {
      queryClient.setQueryData<InboxQuickReply[]>(QUICK_REPLIES_KEY, (old) =>
        old
          ? [...old, newQuickReply].toSorted((a, b) => a.title.localeCompare(b.title))
          : [newQuickReply]
      )
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, ...params }: { id: string } & Partial<CreateQuickReplyParams>) =>
      inboxService.updateQuickReply(id, params),
    onSuccess: (updated) => {
      queryClient.setQueryData<InboxQuickReply[]>(QUICK_REPLIES_KEY, (old) =>
        old?.map((qr) => (qr.id === updated.id ? updated : qr))
      )
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: inboxService.deleteQuickReply,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUICK_REPLIES_KEY })

      const previousQuickReplies = queryClient.getQueryData<InboxQuickReply[]>(QUICK_REPLIES_KEY)

      // Optimistic delete
      queryClient.setQueryData<InboxQuickReply[]>(QUICK_REPLIES_KEY, (old) =>
        old?.filter((qr) => qr.id !== id)
      )

      return { previousQuickReplies }
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousQuickReplies) {
        queryClient.setQueryData(QUICK_REPLIES_KEY, context.previousQuickReplies)
      }
    },
  })

  return {
    quickReplies: quickRepliesQuery.data ?? [],
    isLoading: quickRepliesQuery.isLoading,
    error: quickRepliesQuery.error,

    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,

    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    refetch: quickRepliesQuery.refetch,
  }
}

// =============================================================================
// Helper: Search quick replies
// =============================================================================

export function useQuickRepliesSearch(search: string) {
  const { quickReplies, isLoading } = useQuickReplies()

  const filtered = useMemo(() => {
    if (!search.trim()) return quickReplies

    const lowerSearch = search.toLowerCase()
    return quickReplies.filter(
      (qr) =>
        qr.title.toLowerCase().includes(lowerSearch) ||
        qr.content.toLowerCase().includes(lowerSearch) ||
        qr.shortcut?.toLowerCase().includes(lowerSearch)
    )
  }, [quickReplies, search])

  return {
    quickReplies: filtered,
    isLoading,
  }
}

// =============================================================================
// Helper: Get by shortcut
// =============================================================================

export function useQuickReplyByShortcut(shortcut: string | null) {
  const { quickReplies, isLoading } = useQuickReplies()

  const quickReply = useMemo(() => {
    if (!shortcut) return null
    return quickReplies.find((qr) => qr.shortcut === shortcut)
  }, [quickReplies, shortcut])

  return {
    quickReply,
    isLoading,
  }
}
