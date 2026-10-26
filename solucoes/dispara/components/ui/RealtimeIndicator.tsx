'use client'

/**
 * RealtimeIndicator
 * 
 * Visual indicator for Realtime connection status.
 * Shows live/offline status with optional tooltip.
 * Part of the Realtime infrastructure (T008).
 */

import { useRealtime } from '@/hooks/useRealtime'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'

// ============================================================================
// PROPS
// ============================================================================

interface RealtimeIndicatorProps {
    /**
     * Show text label next to icon
     */
    showLabel?: boolean

    /**
     * CSS classes for container
     */
    className?: string

    /**
     * Size variant
     */
    size?: 'sm' | 'md' | 'lg'
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Shows Realtime connection status
 * 
 * @example
 * ```tsx
 * <RealtimeIndicator size="sm" />
 * <RealtimeIndicator showLabel size="md" />
 * ```
 */
export function RealtimeIndicator({
    showLabel = false,
    className,
    size = 'md'
}: RealtimeIndicatorProps) {
    const { isConnected, status, error, reconnect } = useRealtime()

    // Size classes
    const sizeClasses = {
        sm: 'text-xs gap-1',
        md: 'text-sm gap-1.5',
        lg: 'text-base gap-2',
    }

    const iconSizes = {
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
    }

    // Status display
    const statusConfig = isConnected
        ? {
            icon: Wifi,
            label: 'Ao vivo',
            colorClass: 'text-primary-400',
            dotClass: 'bg-primary-400',
        }
        : {
            icon: WifiOff,
            label: 'Offline',
            colorClass: 'text-[var(--ds-text-muted)]',
            dotClass: 'bg-slate-500',
        }

    const Icon = statusConfig.icon

    return (
        <div
            className={cn(
                'flex items-center',
                sizeClasses[size],
                className
            )}
            title={error || status || 'Status da conexão Realtime'}
        >
            {/* Pulsing dot */}
            <span className="relative flex">
                <span
                    className={cn(
                        'absolute inline-flex h-full w-full rounded-full opacity-75',
                        statusConfig.dotClass,
                        isConnected && 'animate-ping'
                    )}
                />
                <span
                    className={cn(
                        'relative inline-flex rounded-full',
                        size === 'sm' ? 'h-1.5 w-1.5' : size === 'md' ? 'h-2 w-2' : 'h-2.5 w-2.5',
                        statusConfig.dotClass
                    )}
                />
            </span>

            {/* Icon */}
            <Icon className={cn(iconSizes[size], statusConfig.colorClass)} />

            {/* Label */}
            {showLabel && (
                <span className={cn('font-medium', statusConfig.colorClass)}>
                    {statusConfig.label}
                </span>
            )}

            {/* Reconnect button (show on error) */}
            {error && !isConnected && (
                <button
                    onClick={reconnect}
                    className="p-1 hover:bg-[var(--ds-bg-hover)] rounded transition-colors"
                    title="Reconectar"
                >
                    <RefreshCw className={cn(iconSizes[size], 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]')} />
                </button>
            )}
        </div>
    )
}
