/**
 * useCampaignFolders - Campaign folder management hook
 * Provides CRUD operations for campaign folders
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignService } from '@/services/campaignService'
import type { CampaignFolder, CreateCampaignFolderDTO, UpdateCampaignFolderDTO } from '@/types'
import { CACHE } from '@/lib/constants'

const FOLDERS_KEY = ['campaign-folders']

// =============================================================================
// Folders Hook
// =============================================================================

interface FoldersData {
  folders: CampaignFolder[]
  totalCount: number
  unfiledCount: number
}

export function useCampaignFolders() {
  const queryClient = useQueryClient()

  // List query
  const foldersQuery = useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: campaignService.listFolders,
    staleTime: CACHE.campaigns,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: campaignService.createFolder,
    onSuccess: (newFolder) => {
      queryClient.setQueryData<FoldersData>(FOLDERS_KEY, (old) => {
        if (!old) return { folders: [newFolder], totalCount: 0, unfiledCount: 0 }
        return {
          ...old,
          folders: [...old.folders, { ...newFolder, campaignCount: 0 }].sort((a, b) =>
            a.name.localeCompare(b.name)
          ),
        }
      })
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCampaignFolderDTO }) =>
      campaignService.updateFolder(id, dto),
    onSuccess: (updatedFolder) => {
      queryClient.setQueryData<FoldersData>(FOLDERS_KEY, (old) => {
        if (!old) return { folders: [updatedFolder], totalCount: 0, unfiledCount: 0 }
        return {
          ...old,
          folders: old.folders
            .map((f) => (f.id === updatedFolder.id ? { ...f, ...updatedFolder } : f))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }
      })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: campaignService.deleteFolder,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: FOLDERS_KEY })

      const previousData = queryClient.getQueryData<FoldersData>(FOLDERS_KEY)

      // Optimistic delete
      queryClient.setQueryData<FoldersData>(FOLDERS_KEY, (old) => {
        if (!old) return { folders: [], totalCount: 0, unfiledCount: 0 }
        const deletedFolder = old.folders.find((f) => f.id === id)
        const deletedCount = deletedFolder?.campaignCount || 0
        return {
          ...old,
          folders: old.folders.filter((f) => f.id !== id),
          unfiledCount: old.unfiledCount + deletedCount,
        }
      })

      return { previousData }
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(FOLDERS_KEY, context.previousData)
      }
    },
    onSuccess: () => {
      // Invalidate campaigns that might have this folder
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })

  const data = foldersQuery.data

  return {
    folders: data?.folders ?? [],
    totalCount: data?.totalCount ?? 0,
    unfiledCount: data?.unfiledCount ?? 0,
    isLoading: foldersQuery.isLoading,
    error: foldersQuery.error,

    create: createMutation.mutateAsync,
    update: (id: string, dto: UpdateCampaignFolderDTO) =>
      updateMutation.mutateAsync({ id, dto }),
    delete: deleteMutation.mutateAsync,

    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    refetch: foldersQuery.refetch,
  }
}

// =============================================================================
// Helper: Get folder by ID
// =============================================================================

export function useCampaignFolderById(folderId: string | null) {
  const { folders, isLoading } = useCampaignFolders()

  const folder = folderId ? folders.find((f) => f.id === folderId) : null

  return {
    folder,
    isLoading,
  }
}
