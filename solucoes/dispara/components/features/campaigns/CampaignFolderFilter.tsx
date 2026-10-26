'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useCampaignFolders } from '@/hooks/useCampaignFolders'
import { FolderIcon, FolderOpenIcon, ChevronDownIcon, XIcon, CheckIcon, SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CampaignFolderFilterProps {
  selectedFolderId: string | null
  onChange: (folderId: string | null) => void
  onManage?: () => void
  className?: string
}

/**
 * Dropdown para filtrar campanhas por pasta
 * null = todas as campanhas
 * 'none' = sem pasta
 * UUID = pasta específica
 */
export function CampaignFolderFilter({
  selectedFolderId,
  onChange,
  onManage,
  className,
}: CampaignFolderFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { folders, totalCount, unfiledCount, isLoading } = useCampaignFolders()

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

  const handleSelect = useCallback((folderId: string | null) => {
    onChange(folderId)
    setIsOpen(false)
  }, [onChange])

  const clearFilter = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }, [onChange])

  // Label para o botão - memoizado para evitar recálculos
  const selectedLabel = useMemo(() => {
    if (selectedFolderId === null) return null
    if (selectedFolderId === 'none') return 'Sem pasta'
    const folder = folders.find(f => f.id === selectedFolderId)
    return folder?.name || 'Pasta'
  }, [selectedFolderId, folders])
  const hasFilter = selectedFolderId !== null
  const selectedFolder = selectedFolderId && selectedFolderId !== 'none'
    ? folders.find(f => f.id === selectedFolderId)
    : null

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 h-9 border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]',
          hasFilter && 'border-primary-500/50'
        )}
      >
        {selectedFolder ? (
          <FolderIcon className="h-4 w-4" style={{ color: selectedFolder.color }} />
        ) : (
          <FolderIcon className="h-4 w-4 text-[var(--ds-text-secondary)]" />
        )}
        <span className={cn('text-sm', hasFilter ? 'text-[var(--ds-text-primary)]' : 'text-[var(--ds-text-secondary)]')}>
          {selectedLabel || 'Pasta'}
        </span>
        <ChevronDownIcon
          className={cn(
            'h-4 w-4 text-[var(--ds-text-muted)] transition-transform',
            isOpen && 'rotate-180'
          )}
        />
        {hasFilter && (
          <button
            onClick={clearFilter}
            className="ml-1 p-0.5 hover:bg-[var(--ds-bg-surface)] rounded"
            title="Limpar filtro"
          >
            <XIcon className="h-3 w-3 text-[var(--ds-text-secondary)]" />
          </button>
        )}
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] shadow-xl z-[200]">
          <div className="p-2 border-b border-[var(--ds-border-default)] flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--ds-text-secondary)] uppercase tracking-wider">
              Filtrar por pasta
            </span>
            {onManage && (
              <button
                onClick={() => {
                  onManage()
                  setIsOpen(false)
                }}
                className="p-1 hover:bg-[var(--ds-bg-surface)] rounded text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
                title="Gerenciar pastas"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ds-border-default)] border-t-primary-500" />
            </div>
          ) : folders.length === 0 ? (
            <div className="p-4 text-center text-sm text-[var(--ds-text-muted)]">
              Nenhuma pasta criada
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto p-1">
              {/* Todas as campanhas */}
              <button
                onClick={() => handleSelect(null)}
                className={cn(
                  'flex items-center w-full px-3 py-2 rounded text-sm transition-colors gap-2',
                  selectedFolderId === null
                    ? 'bg-primary-500/10 text-primary-400'
                    : 'text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-surface)]/50'
                )}
              >
                <FolderOpenIcon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left truncate">Todas</span>
                <span className="text-xs text-[var(--ds-text-muted)]">({totalCount})</span>
                {selectedFolderId === null && (
                  <CheckIcon className="h-4 w-4 text-primary-400 ml-1" />
                )}
              </button>

              {/* Pastas do usuário */}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleSelect(folder.id)}
                  className={cn(
                    'flex items-center w-full px-3 py-2 rounded text-sm transition-colors gap-2',
                    selectedFolderId === folder.id
                      ? 'bg-primary-500/10 text-primary-400'
                      : 'text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-surface)]/50'
                  )}
                >
                  <FolderIcon
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: folder.color }}
                  />
                  <span className="flex-1 text-left truncate">{folder.name}</span>
                  <span className="text-xs text-[var(--ds-text-muted)]">({folder.campaignCount || 0})</span>
                  {selectedFolderId === folder.id && (
                    <CheckIcon className="h-4 w-4 text-primary-400 ml-1" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
