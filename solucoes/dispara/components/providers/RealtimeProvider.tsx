'use client'

/**
 * RealtimeProvider
 * 
 * Global provider for Supabase Realtime connection management.
 * Provides connection status and reconnect functionality to children.
 * Part of the Realtime infrastructure (T006).
 */

import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react'
import { RealtimeContext, type RealtimeContextValue } from '@/hooks/useRealtime'
import { createRealtimeChannel, activateChannel, removeChannel } from '@/lib/supabase-realtime'
import type { ChannelStatus } from '@/types'

// ============================================================================
// PROPS
// ============================================================================

interface RealtimeProviderProps {
    children: ReactNode
}

// ============================================================================
// PROVIDER
// ============================================================================

/**
 * Wraps the app to provide Realtime connection context
 * 
 * @example
 * ```tsx
 * // In app/providers.tsx
 * import { RealtimeProvider } from '@/components/providers/RealtimeProvider'
 * 
 * export function Providers({ children }) {
 *   return (
 *     <QueryClientProvider client={queryClient}>
 *       <RealtimeProvider>
 *         {children}
 *       </RealtimeProvider>
 *     </QueryClientProvider>
 *   )
 * }
 * ```
 */
export function RealtimeProvider({ children }: RealtimeProviderProps) {
    const [isConnected, setIsConnected] = useState(false)
    const [status, setStatus] = useState<ChannelStatus | null>(null)
    const [error, setError] = useState<string | undefined>()
    const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(null)
    const mountedRef = useRef(true)

    // Connect to Realtime
    const connect = useCallback(() => {
        // Cleanup existing connection
        if (channelRef.current) {
            removeChannel(channelRef.current)
        }

        // Create new heartbeat channel
        const channel = createRealtimeChannel(`app-heartbeat-${Date.now()}`)

        // Skip if Supabase not configured
        if (!channel) {
            setError('Supabase not configured')
            setIsConnected(false)
            return
        }

        channelRef.current = channel

        // Activate and track status
        activateChannel(channel, (newStatus) => {
            if (!mountedRef.current) return

            setStatus(newStatus)
            setIsConnected(newStatus === 'SUBSCRIBED')

            if (newStatus === 'CHANNEL_ERROR' || newStatus === 'TIMED_OUT') {
                setError(`Connection failed: ${newStatus}`)
            } else {
                setError(undefined)
            }
        }).catch((err) => {
            if (mountedRef.current) {
                setError(err.message)
                setIsConnected(false)
            }
        })
    }, [])

    // Reconnect function
    const reconnect = useCallback(() => {
        setError(undefined)
        connect()
    }, [connect])

    // Initial connection
    useEffect(() => {
        mountedRef.current = true
        connect()

        return () => {
            mountedRef.current = false
            if (channelRef.current) {
                removeChannel(channelRef.current)
                channelRef.current = null
            }
        }
    }, [connect])

    // Context value - memoized to prevent unnecessary re-renders in consumers
    const value = useMemo<RealtimeContextValue>(
        () => ({ isConnected, status, error, reconnect }),
        [isConnected, status, error, reconnect]
    )

    return (
        <RealtimeContext.Provider value={value}>
            {children}
        </RealtimeContext.Provider>
    )
}
