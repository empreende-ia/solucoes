/**
 * useInboxSettings - Hook for managing inbox configuration
 *
 * Fetches and updates inbox settings like human mode timeout
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface InboxSettings {
  retention_days: number
  human_mode_timeout_hours: number
}

const INBOX_SETTINGS_KEY = ['inbox-settings']

async function fetchInboxSettings(): Promise<InboxSettings> {
  const response = await fetch('/api/settings/inbox')
  if (!response.ok) {
    throw new Error('Failed to fetch inbox settings')
  }
  return response.json()
}

async function updateInboxSettings(data: Partial<InboxSettings>): Promise<InboxSettings> {
  const response = await fetch('/api/settings/inbox', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update inbox settings')
  }
  return response.json()
}

export function useInboxSettings() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: INBOX_SETTINGS_KEY,
    queryFn: fetchInboxSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const mutation = useMutation({
    mutationFn: updateInboxSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(INBOX_SETTINGS_KEY, data)
    },
  })

  return {
    settings: query.data,
    isLoading: query.isLoading,
    error: query.error,

    updateSettings: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    updateError: mutation.error,

    // Convenience getters with defaults (0 = nunca expira)
    humanModeTimeoutHours: query.data?.human_mode_timeout_hours ?? 0,
    retentionDays: query.data?.retention_days ?? 365,
  }
}

/**
 * Get human mode timeout in milliseconds
 * Returns 0 if timeout is disabled (never expires)
 */
export function getHumanModeTimeoutMs(hours: number): number {
  if (hours === 0) return 0 // 0 means never expires
  return hours * 60 * 60 * 1000
}
