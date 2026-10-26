'use client'

/**
 * T039: QuickRepliesPopover - Searchable list of quick replies
 * Click to insert content into message input
 */

import React, { useState, useMemo } from 'react'
import { MessageSquareDashed, Search, Settings, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { QuickReplyManager } from './QuickReplyManager'
import type { InboxQuickReply } from '@/types'

export interface QuickRepliesPopoverProps {
  quickReplies: InboxQuickReply[]
  onSelect: (content: string) => void
  isLoading?: boolean
  onRefresh?: () => void
}

export function QuickRepliesPopover({
  quickReplies,
  onSelect,
  isLoading,
  onRefresh,
}: QuickRepliesPopoverProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)

  // Filter quick replies
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

  const handleSelect = (qr: InboxQuickReply) => {
    onSelect(qr.content)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
            >
              <MessageSquareDashed className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Respostas rápidas</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        side="top"
        className="w-80 p-0"
        sideOffset={8}
      >
        {/* Header */}
        <div className="p-3 border-b border-[var(--ds-border-subtle)]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-[var(--ds-text-primary)]">Respostas Rápidas</h4>
            <button
              onClick={() => {
                setOpen(false)
                setManagerOpen(true)
              }}
              className="p-1 rounded text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
              title="Gerenciar respostas rápidas"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ds-text-muted)]" />
            <Input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm bg-[var(--ds-bg-surface)] border-[var(--ds-border-subtle)]"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="max-h-[300px]">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse space-y-1">
                  <div className="h-4 w-1/3 bg-[var(--ds-bg-surface)] rounded" />
                  <div className="h-3 w-2/3 bg-[var(--ds-bg-surface)] rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-[var(--ds-text-muted)]">
                {search
                  ? 'Nenhuma resposta encontrada'
                  : 'Nenhuma resposta rápida cadastrada'}
              </p>
            </div>
          ) : (
            <div className="p-1">
              {filtered.map((qr) => (
                <button
                  key={qr.id}
                  onClick={() => handleSelect(qr)}
                  className={cn(
                    'w-full p-2 rounded-md text-left',
                    'hover:bg-[var(--ds-bg-hover)] transition-colors'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--ds-text-primary)]">
                      {qr.title}
                    </span>
                    {qr.shortcut && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] font-mono">
                        /{qr.shortcut}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--ds-text-muted)] mt-0.5 line-clamp-2">
                    {qr.content}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>

      {/* Manager Modal */}
      <QuickReplyManager
        open={managerOpen}
        onOpenChange={setManagerOpen}
        quickReplies={quickReplies}
        onRefresh={onRefresh || (() => {})}
      />
    </Popover>
  )
}
