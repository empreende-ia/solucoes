'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useCampaignTags } from '@/hooks/useCampaignTags'
import { TagIcon, ChevronDownIcon, XIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampaignTagBadge } from './CampaignTagBadge'
import type { CampaignTag } from '@/types'

interface CampaignTagFilterProps {
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
  className?: string
}

/**
 * Dropdown multi-select para filtrar por tags
 */
export function CampaignTagFilter({
  selectedTagIds,
  onChange,
  className,
}: CampaignTagFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { tags, isLoading } = useCampaignTags()

  // Fecha o dropdown quando clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
    setIsOpen(false)
  }

  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id))
  const hasSelection = selectedTagIds.length > 0

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 h-9 border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]',
          hasSelection && 'border-primary-500/50'
        )}
      >
        <TagIcon className="h-4 w-4 text-[var(--ds-text-secondary)]" />
        {hasSelection ? (
          <span className="flex items-center gap-1">
            <span className="text-sm">Tags</span>
            <span className="bg-primary-500/20 text-primary-400 rounded-full px-1.5 py-0.5 text-xs font-medium">
              {selectedTagIds.length}
            </span>
          </span>
        ) : (
          <span className="text-sm text-[var(--ds-text-secondary)]">Tags</span>
        )}
        <ChevronDownIcon
          className={cn(
            'h-4 w-4 text-[var(--ds-text-muted)] transition-transform',
            isOpen && 'rotate-180'
          )}
        />
        {hasSelection && (
          <button
            onClick={clearAll}
            className="ml-1 p-0.5 hover:bg-[var(--ds-bg-surface)] rounded"
            title="Limpar filtro"
          >
            <XIcon className="h-3 w-3 text-[var(--ds-text-secondary)]" />
          </button>
        )}
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] shadow-xl z-[200]">
          <div className="p-2 border-b border-[var(--ds-border-default)]">
            <span className="text-xs font-medium text-[var(--ds-text-secondary)] uppercase tracking-wider">
              Filtrar por tags
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ds-border-default)] border-t-primary-500" />
            </div>
          ) : tags.length === 0 ? (
            <div className="p-4 text-center text-sm text-[var(--ds-text-muted)]">
              Nenhuma tag criada
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto p-2">
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      'flex items-center w-full px-2 py-1.5 rounded text-sm transition-colors',
                      isSelected
                        ? 'bg-primary-500/10'
                        : 'hover:bg-[var(--ds-bg-surface)]/50'
                    )}
                  >
                    <div
                      className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-left text-[var(--ds-text-primary)] truncate">
                      {tag.name}
                    </span>
                    {isSelected && (
                      <CheckIcon className="h-4 w-4 text-primary-400 ml-2" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {hasSelection && (
            <div className="p-2 border-t border-[var(--ds-border-default)]">
              <div className="flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <CampaignTagBadge
                    key={tag.id}
                    tag={tag}
                    size="sm"
                    onRemove={() => toggleTag(tag.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
