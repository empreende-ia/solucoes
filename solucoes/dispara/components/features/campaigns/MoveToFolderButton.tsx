'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useCampaignFolders } from '@/hooks/useCampaignFolders'
import { FolderIcon, FolderInputIcon, CheckIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { CampaignFolder } from '@/types'

interface MoveToFolderButtonProps {
  campaignId: string
  currentFolderId?: string | null
  onMove: (campaignId: string, folderId: string | null) => void
  isMoving?: boolean
  size?: 'sm' | 'default'
}

/**
 * Botão com popover para mover campanha para uma pasta
 */
export function MoveToFolderButton({
  campaignId,
  currentFolderId,
  onMove,
  isMoving,
  size = 'sm',
}: MoveToFolderButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { folders, isLoading } = useCampaignFolders()

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (folderId: string | null) => {
    if (folderId !== currentFolderId) {
      onMove(campaignId, folderId)
    }
    setIsOpen(false)
  }

  const currentFolder = folders.find(f => f.id === currentFolderId)

  // Não mostra o botão se não há pastas
  if (!isLoading && folders.length === 0) {
    return null
  }

  return (
    <div ref={containerRef} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={size === 'sm' ? 'icon-sm' : 'icon'}
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
            disabled={isMoving}
          >
            {currentFolder ? (
              <FolderIcon size={16} style={{ color: currentFolder.color }} />
            ) : (
              <FolderInputIcon size={16} className="text-[var(--ds-text-secondary)]" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{currentFolder ? `Pasta: ${currentFolder.name}` : 'Mover para pasta'}</p>
        </TooltipContent>
      </Tooltip>

      {isOpen && (
        <div
          className="absolute top-full right-0 mt-1 w-48 rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] shadow-xl z-[200]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b border-[var(--ds-border-default)]">
            <span className="text-xs font-medium text-[var(--ds-text-secondary)] uppercase tracking-wider">
              Mover para
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--ds-border-default)] border-t-primary-500" />
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto p-1">
              {/* Remover da pasta */}
              {currentFolderId && (
                <button
                  onClick={() => handleSelect(null)}
                  className="flex items-center w-full px-3 py-2 rounded text-sm transition-colors gap-2 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]"
                >
                  <XIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left">Remover da pasta</span>
                </button>
              )}

              {/* Pastas disponíveis */}
              {folders.map((folder) => {
                const isCurrentFolder = folder.id === currentFolderId
                return (
                  <button
                    key={folder.id}
                    onClick={() => handleSelect(folder.id)}
                    className={cn(
                      'flex items-center w-full px-3 py-2 rounded text-sm transition-colors gap-2',
                      isCurrentFolder
                        ? 'bg-primary-500/10 text-primary-400'
                        : 'text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
                    )}
                  >
                    <FolderIcon
                      className="h-4 w-4 flex-shrink-0"
                      style={{ color: folder.color }}
                    />
                    <span className="flex-1 text-left truncate">{folder.name}</span>
                    {isCurrentFolder && (
                      <CheckIcon className="h-4 w-4 text-primary-400" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
