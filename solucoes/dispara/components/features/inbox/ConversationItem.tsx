'use client'

/**
 * ConversationItem - Clean List Item
 *
 * Design Philosophy:
 * - No borders between items (uses spacing + hover states)
 * - Compact, scannable layout
 * - Subtle mode indicator (dot instead of badge)
 * - Rounded selection state
 */

import React, { memo } from 'react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/date-utils'
import type { InboxConversation } from '@/types'

export interface ConversationItemProps {
  conversation: InboxConversation
  isSelected: boolean
  onClick: () => void
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: ConversationItemProps) {
  const {
    phone,
    contact,
    mode,
    status,
    unread_count,
    last_message_preview,
    last_message_at,
    labels,
    ai_agent,
  } = conversation

  // Agent display name for bot mode
  const agentName = ai_agent?.name

  // Display name: contact name or phone
  const displayName = contact?.name || phone
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // Format time
  const timeAgo = formatRelativeTime(last_message_at)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-2 py-2 flex items-start gap-2.5 text-left rounded-lg',
        'transition-all duration-150',
        // Default state
        'hover:bg-[var(--ds-bg-hover)]',
        // Selected state - subtle background, no border
        isSelected && 'bg-[var(--ds-bg-surface)]/80',
        // Unread state - slightly different bg
        unread_count > 0 && !isSelected && 'bg-[var(--ds-bg-surface)]/30'
      )}
    >
      {/* Avatar - smaller, cleaner */}
      <div className="relative shrink-0">
        <div className="h-9 w-9 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center">
          <span className="text-xs font-medium text-[var(--ds-text-secondary)]">{initials}</span>
        </div>
        {/* Mode indicator dot */}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--ds-bg-elevated)]',
            mode === 'bot' ? 'bg-primary-500' : 'bg-amber-500'
          )}
        />
      </div>

      {/* Content - tighter layout */}
      <div className="flex-1 min-w-0 py-0.5">
        {/* Header row: name + unread/time */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-[13px]',
              unread_count > 0 ? 'font-medium text-[var(--ds-text-primary)]' : 'text-[var(--ds-text-secondary)]'
            )}
          >
            {displayName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {unread_count > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-primary-500 text-[10px] font-medium text-white flex items-center justify-center px-1">
                {unread_count > 99 ? '99' : unread_count}
              </span>
            )}
            <span className="text-[10px] text-[var(--ds-text-muted)]">{timeAgo}</span>
          </div>
        </div>

        {/* Message preview + status */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {/* Closed indicator */}
          {status === 'closed' && (
            <span className="text-[9px] text-[var(--ds-text-muted)] bg-[var(--ds-bg-surface)] px-1 py-0.5 rounded">
              fechada
            </span>
          )}
          <p
            className={cn(
              'text-[11px] truncate',
              unread_count > 0 ? 'text-[var(--ds-text-secondary)]' : 'text-[var(--ds-text-muted)]'
            )}
          >
            {last_message_preview || 'Sem mensagens'}
          </p>
        </div>

        {/* Labels - minimal dots */}
        {labels && labels.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {labels.slice(0, 3).map((label) => (
              <span
                key={label.id}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: label.color }}
                title={label.name}
              />
            ))}
            {labels.length > 3 && (
              <span className="text-[9px] text-[var(--ds-text-muted)]">+{labels.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </button>
  )
})
