'use client'

import * as React from 'react'
import { Search, RefreshCw, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Dispara Design System - FilterBar
 *
 * Barra de filtros padronizada para páginas de listagem.
 * Inclui: Search, Dropdowns de filtro, Refresh, Ações extras.
 *
 * @example
 * ```tsx
 * <FilterBar
 *   searchValue={search}
 *   onSearchChange={setSearch}
 *   searchPlaceholder="Buscar contatos..."
 *   onRefresh={handleRefresh}
 *   isRefreshing={isLoading}
 *   filters={[
 *     {
 *       id: 'status',
 *       label: 'Status',
 *       value: statusFilter,
 *       onChange: setStatusFilter,
 *       options: [
 *         { value: 'all', label: 'Todos' },
 *         { value: 'active', label: 'Ativos' },
 *       ],
 *     },
 *   ]}
 * />
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export interface FilterOption {
  value: string
  label: string
}

export interface FilterConfig {
  /** ID único do filtro */
  id: string
  /** Label exibido no placeholder */
  label: string
  /** Valor atual */
  value: string
  /** Callback de mudança */
  onChange: (value: string) => void
  /** Opções disponíveis */
  options: FilterOption[]
}

export interface FilterBarProps {
  /** Valor atual do search */
  searchValue?: string
  /** Callback de mudança do search */
  onSearchChange?: (value: string) => void
  /** Placeholder do search */
  searchPlaceholder?: string
  /** Lista de filtros dropdown */
  filters?: FilterConfig[]
  /** Callback de refresh */
  onRefresh?: () => void
  /** Estado de loading do refresh */
  isRefreshing?: boolean
  /** Slot para ações extras à direita */
  actions?: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
  /** Mostrar ícone de filtro antes dos dropdowns */
  showFilterIcon?: boolean
  /** Informação de resultados (ex: "Mostrando 10 de 100") */
  resultsInfo?: React.ReactNode
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FilterBar({
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  filters = [],
  onRefresh,
  isRefreshing = false,
  actions,
  className,
  showFilterIcon = false,
  resultsInfo,
}: FilterBarProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Main Filter Row */}
      <div
        className={cn(
          'flex flex-col gap-3 p-4 rounded-2xl',
          'bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)]',
          'sm:flex-row sm:items-center sm:justify-between'
        )}
      >
        {/* Left: Search + Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1">
          {/* Search Input */}
          {onSearchChange && (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 rounded-xl',
                  'bg-[var(--ds-bg-surface)]/40 border border-[var(--ds-border-subtle)]',
                  'text-sm text-white placeholder:text-slate-500',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50',
                  'transition-all duration-200'
                )}
              />
            </div>
          )}

          {/* Filter Icon (optional) */}
          {showFilterIcon && filters.length > 0 && (
            <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800/50 border border-[var(--ds-border-subtle)]">
              <Filter className="w-4 h-4 text-slate-400" />
            </div>
          )}

          {/* Filter Dropdowns */}
          {filters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <Select
                  key={filter.id}
                  value={filter.value}
                  onValueChange={filter.onChange}
                >
                  <SelectTrigger
                    className={cn(
                      'min-w-[140px] h-10',
                      'bg-[var(--ds-bg-surface)]/40 border-[var(--ds-border-subtle)]',
                      'text-sm text-slate-300',
                      'hover:bg-slate-900/80 hover:border-white/15',
                      'focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50'
                    )}
                  >
                    <SelectValue placeholder={filter.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {filter.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            </div>
          )}
        </div>

        {/* Right: Refresh + Actions */}
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-10 w-10 border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/40 hover:bg-slate-900/80"
              title="Atualizar"
            >
              <RefreshCw
                className={cn('w-4 h-4', isRefreshing && 'animate-spin')}
              />
            </Button>
          )}
          {actions}
        </div>
      </div>

      {/* Results Info (optional) */}
      {resultsInfo && (
        <div className="text-sm text-slate-500 px-1">
          {resultsInfo}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// HELPER - Results Info Text
// =============================================================================

export interface ResultsInfoProps {
  showing: number
  total: number
  itemName?: string
}

export function ResultsInfo({ showing, total, itemName = 'itens' }: ResultsInfoProps) {
  return (
    <span>
      Mostrando <span className="text-primary-400 font-medium">{showing}</span> de{' '}
      <span className="text-white font-medium">{total}</span> {itemName}
    </span>
  )
}
