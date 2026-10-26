'use client'

import { cn } from '@/lib/utils'
import type { CampaignTag } from '@/types'

interface CampaignTagBadgeProps {
  tag: CampaignTag
  size?: 'sm' | 'md'
  onRemove?: () => void
  className?: string
}

/**
 * Badge colorido para exibir uma tag de campanha
 */
export function CampaignTagBadge({
  tag,
  size = 'sm',
  onRemove,
  className,
}: CampaignTagBadgeProps) {
  // Calcula luminância para determinar cor do texto
  const getTextColor = (bgColor: string): string => {
    // Parse hex color
    const hex = bgColor.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)

    // Calcula luminância relativa
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 ? '#000000' : '#ffffff'
  }

  const textColor = getTextColor(tag.color)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-2.5 py-1 text-sm',
        className
      )}
      style={{
        backgroundColor: tag.color,
        color: textColor,
      }}
      role="status"
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 hover:opacity-75 transition-opacity"
          aria-label={`Remover tag ${tag.name}`}
        >
          <svg className="h-3 w-3" viewBox="0 0 14 14" fill="currentColor">
            <path d="M4.293 4.293a1 1 0 011.414 0L7 5.586l1.293-1.293a1 1 0 111.414 1.414L8.414 7l1.293 1.293a1 1 0 01-1.414 1.414L7 8.414l-1.293 1.293a1 1 0 01-1.414-1.414L5.586 7 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      )}
    </span>
  )
}

interface CampaignTagListProps {
  tags: CampaignTag[]
  maxVisible?: number
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Lista de tags com limite de exibição e indicador "+N"
 */
export function CampaignTagList({
  tags,
  maxVisible = 2,
  size = 'sm',
  className,
}: CampaignTagListProps) {
  if (tags.length === 0) return null

  const visibleTags = tags.slice(0, maxVisible)
  const hiddenCount = tags.length - maxVisible

  return (
    <div className={cn('flex items-center gap-1 flex-wrap', className)}>
      {visibleTags.map((tag) => (
        <CampaignTagBadge key={tag.id} tag={tag} size={size} />
      ))}
      {hiddenCount > 0 && (
        <span
          className={cn(
            'inline-flex items-center rounded-full bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] font-medium',
            size === 'sm' && 'px-1.5 py-0.5 text-xs',
            size === 'md' && 'px-2 py-1 text-sm'
          )}
          title={tags.slice(maxVisible).map((t) => t.name).join(', ')}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}
