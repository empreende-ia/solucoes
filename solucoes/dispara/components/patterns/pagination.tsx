'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Dispara Design System - Pagination
 *
 * Componente de paginação padronizado.
 * Suporta navegação por números e prev/next.
 *
 * @example
 * ```tsx
 * <Pagination
 *   currentPage={1}
 *   totalPages={10}
 *   onPageChange={setPage}
 * />
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PaginationProps {
  /** Página atual (1-indexed) */
  currentPage: number
  /** Total de páginas */
  totalPages: number
  /** Callback de mudança de página */
  onPageChange: (page: number) => void
  /** Número máximo de botões de página visíveis */
  maxVisible?: number
  /** Classes CSS adicionais */
  className?: string
  /** Mostrar informação de página (ex: "Página 1 de 10") */
  showInfo?: boolean
}

// =============================================================================
// HELPER - Calcular páginas visíveis
// =============================================================================

function getVisiblePages(
  currentPage: number,
  totalPages: number,
  maxVisible: number
): (number | 'ellipsis')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const halfVisible = Math.floor(maxVisible / 2)
  const pages: (number | 'ellipsis')[] = []

  // Sempre mostrar primeira página
  pages.push(1)

  // Calcular range do meio
  let start = Math.max(2, currentPage - halfVisible + 1)
  let end = Math.min(totalPages - 1, currentPage + halfVisible - 1)

  // Ajustar se estiver no início ou fim
  if (currentPage <= halfVisible) {
    end = maxVisible - 2
  } else if (currentPage >= totalPages - halfVisible) {
    start = totalPages - maxVisible + 3
  }

  // Ellipsis antes do range
  if (start > 2) {
    pages.push('ellipsis')
  }

  // Páginas do meio
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  // Ellipsis depois do range
  if (end < totalPages - 1) {
    pages.push('ellipsis')
  }

  // Sempre mostrar última página
  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return pages
}

// =============================================================================
// COMPONENT
// =============================================================================

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  maxVisible = 5,
  className,
  showInfo = true,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const visiblePages = getVisiblePages(currentPage, totalPages, maxVisible)
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-4 px-6',
        'sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      {/* Page Info */}
      {showInfo && (
        <div className="text-sm text-slate-500">
          Página <span className="text-white font-medium">{currentPage}</span> de{' '}
          <span className="text-white font-medium">{totalPages}</span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-1">
        {/* Previous Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrev}
          className="h-9 w-9 border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/40 hover:bg-slate-900/80 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        {/* Page Numbers */}
        {visiblePages.map((page, index) => {
          if (page === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${index}`}
                className="w-9 h-9 flex items-center justify-center text-slate-500"
              >
                ...
              </span>
            )
          }

          const isActive = page === currentPage

          return (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={cn(
                'w-9 h-9 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary-500 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              )}
            >
              {page}
            </button>
          )
        })}

        {/* Next Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          className="h-9 w-9 border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/40 hover:bg-slate-900/80 disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
