/**
 * T059: useKnowledgeBase hook
 * Manages AI agent knowledge base files with React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { AIKnowledgeFile } from '@/types'

// =============================================================================
// Service Functions
// =============================================================================

interface ListFilesResponse {
  files: AIKnowledgeFile[]
}

interface UploadFileParams {
  agent_id: string
  name: string
  content: string
  mime_type?: string
}

async function listFiles(agentId: string): Promise<AIKnowledgeFile[]> {
  const response = await fetch(`/api/ai-agents/knowledge?agent_id=${agentId}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Erro ao listar arquivos')
  }
  const data: ListFilesResponse = await response.json()
  return data.files
}

async function uploadFile(params: UploadFileParams): Promise<AIKnowledgeFile> {
  const response = await fetch('/api/ai-agents/knowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Erro ao enviar arquivo')
  }
  const data = await response.json()
  return data.file
}

async function deleteFile(fileId: string): Promise<void> {
  const response = await fetch(`/api/ai-agents/knowledge?id=${fileId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Erro ao excluir arquivo')
  }
}

// =============================================================================
// Query Keys
// =============================================================================

export const knowledgeBaseKeys = {
  all: ['knowledge-base'] as const,
  byAgent: (agentId: string) => [...knowledgeBaseKeys.all, 'agent', agentId] as const,
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to list knowledge base files for an agent
 */
export function useKnowledgeBase(agentId: string | null) {
  return useQuery({
    queryKey: agentId ? knowledgeBaseKeys.byAgent(agentId) : ['disabled'],
    queryFn: () => listFiles(agentId!),
    enabled: !!agentId,
    staleTime: 30_000, // 30 seconds
  })
}

/**
 * Hook for knowledge base mutations
 */
export function useKnowledgeBaseMutations(agentId: string | null) {
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: (newFile) => {
      // Add the new file to the cache
      if (agentId) {
        queryClient.setQueryData<AIKnowledgeFile[]>(
          knowledgeBaseKeys.byAgent(agentId),
          (old) => (old ? [newFile, ...old] : [newFile])
        )
      }
    },
    onError: (error) => {
      console.error('[useKnowledgeBase] Upload error:', error)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteFile,
    onMutate: async (fileId: string) => {
      // Cancel outgoing queries
      if (agentId) {
        await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.byAgent(agentId) })
      }

      // Snapshot previous value
      const previousFiles = agentId
        ? queryClient.getQueryData<AIKnowledgeFile[]>(knowledgeBaseKeys.byAgent(agentId))
        : undefined

      // Optimistically remove the file
      if (agentId) {
        queryClient.setQueryData<AIKnowledgeFile[]>(
          knowledgeBaseKeys.byAgent(agentId),
          (old) => old?.filter((f) => f.id !== fileId) ?? []
        )
      }

      return { previousFiles }
    },
    onError: (error, _fileId, context) => {
      console.error('[useKnowledgeBase] Delete error:', error)
      // Rollback on error
      if (agentId && context?.previousFiles) {
        queryClient.setQueryData(knowledgeBaseKeys.byAgent(agentId), context.previousFiles)
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.byAgent(agentId) })
      }
    },
  })

  const onUpload = useCallback(
    async (params: Omit<UploadFileParams, 'agent_id'>) => {
      if (!agentId) throw new Error('Agent ID is required')
      return uploadMutation.mutateAsync({ ...params, agent_id: agentId })
    },
    [agentId, uploadMutation]
  )

  const onDelete = useCallback(
    async (fileId: string) => {
      return deleteMutation.mutateAsync(fileId)
    },
    [deleteMutation]
  )

  return {
    onUpload,
    onDelete,
    isUploading: uploadMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}

/**
 * Combined controller hook for knowledge base management
 */
export function useKnowledgeBaseController(agentId: string | null) {
  const { data: files = [], isLoading, error, refetch } = useKnowledgeBase(agentId)
  const mutations = useKnowledgeBaseMutations(agentId)

  // Computed values
  const totalSize = useMemo(() => {
    return files.reduce((sum, file) => sum + file.size_bytes, 0)
  }, [files])

  const indexedFiles = useMemo(() => {
    return files.filter((f) => f.indexing_status === 'completed')
  }, [files])

  const pendingFiles = useMemo(() => {
    return files.filter((f) => f.indexing_status === 'processing' || f.indexing_status === 'pending')
  }, [files])

  const failedFiles = useMemo(() => {
    return files.filter((f) => f.indexing_status === 'failed')
  }, [files])

  return {
    files,
    isLoading,
    error: error as Error | null,
    refetch,
    // Mutations
    onUpload: mutations.onUpload,
    onDelete: mutations.onDelete,
    isUploading: mutations.isUploading,
    isDeleting: mutations.isDeleting,
    // Computed
    totalSize,
    indexedFiles,
    pendingFiles,
    failedFiles,
    fileCount: files.length,
  }
}
