'use client'

/**
 * useRealtime Hook
 * 
 * Provides access to the Realtime context for connection status monitoring.
 * Part of the Realtime infrastructure (T004).
 */

import { createContext, useContext } from 'react'
import type { RealtimeState } from '@/types'

// ============================================================================
// CONTEXT
// ============================================================================

export interface RealtimeContextValue extends RealtimeState {
    /**
     * Force reconnect the Realtime subscription
     */
    reconnect: () => void
}

const defaultContext: RealtimeContextValue = {
    isConnected: false,
    status: null,
    reconnect: () => {
        console.warn('[useRealtime] reconnect called but no RealtimeProvider found')
    },
}

export const RealtimeContext = createContext<RealtimeContextValue>(defaultContext)

// ============================================================================
// HOOK
// ============================================================================

/**
 * Access Realtime connection status and controls
 * 
 * @example
 * ```tsx
 * function StatusBadge() {
 *   const { isConnected, status } = useRealtime()
 *   return <span>{isConnected ? '🟢 Live' : '⚪ Offline'}</span>
 * }
 * ```
 */
export function useRealtime(): RealtimeContextValue {
    return useContext(RealtimeContext)
}
