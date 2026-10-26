'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Page,
  PageHeader,
  PageTitle,
  PageDescription,
  PageActions,
} from '@/components/ui/page'

/**
 * Dispara Design System - ListPageLayout
 *
 * Layout padronizado para páginas de listagem.
 * Estrutura consistente: Header > Stats > Filters > Content
 *
 * @example
 * ```tsx
 * <ListPageLayout
 *   title="Contatos"
 *   description="Gerencie sua audiência e listas"
 *   actions={<Button>+ Novo Contato</Button>}
 *   stats={<StatsRow>...</StatsRow>}
 *   filters={<FilterBar ... />}
 * >
 *   <DataTable ... />
 * </ListPageLayout>
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ListPageLayoutProps {
  /** Título da página */
  title: string
  /** Descrição da página */
  description?: string
  /** Botões de ação no header (à direita) */
  actions?: React.ReactNode
  /** Área de estatísticas (StatsRow) */
  stats?: React.ReactNode
  /** Área de filtros (FilterBar) */
  filters?: React.ReactNode
  /** Tabs de navegação (opcional, abaixo do header) */
  tabs?: React.ReactNode
  /** Conteúdo principal (tabela, grid, etc) */
  children: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
  /** Estado de loading da página inteira */
  isLoading?: boolean
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ListPageLayout({
  title,
  description,
  actions,
  stats,
  tabs,
  filters,
  children,
  className,
  isLoading = false,
}: ListPageLayoutProps) {
  return (
    <Page className={cn(className)}>
      {/* Header Section */}
      <PageHeader>
        <div>
          <PageTitle>{title}</PageTitle>
          {description && <PageDescription>{description}</PageDescription>}
        </div>
        {actions && <PageActions>{actions}</PageActions>}
      </PageHeader>

      {/* Tabs Section (optional) */}
      {tabs && <div className="flex flex-wrap gap-2">{tabs}</div>}

      {/* Stats Section (optional) */}
      {stats && <div>{stats}</div>}

      {/* Filters Section (optional) */}
      {filters && <div>{filters}</div>}

      {/* Content Section */}
      <div
        className={cn(
          'rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] overflow-hidden',
          'shadow-[0_12px_30px_rgba(0,0,0,0.35)]',
          isLoading && 'opacity-70 pointer-events-none'
        )}
      >
        {children}
      </div>
    </Page>
  )
}

// =============================================================================
// TAB BUTTON - Componente auxiliar para tabs de navegação
// =============================================================================

export interface TabButtonProps {
  /** Se a tab está ativa */
  active: boolean
  /** Callback ao clicar */
  onClick: () => void
  /** Conteúdo do botão (texto + ícone) */
  children: React.ReactNode
  /** Badge opcional (ex: "BETA") */
  badge?: string
}

export function TabButton({ active, onClick, children, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all',
        'border',
        active
          ? 'border-primary-400/40 bg-primary-500/10 text-primary-200'
          : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 text-slate-400 hover:text-white hover:bg-[var(--ds-bg-elevated)]'
      )}
    >
      {children}
      {badge && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
            'bg-primary-500/20 text-primary-200 border border-primary-500/30'
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

// =============================================================================
// TABLE CONTAINER - Wrapper para tabelas com estilos consistentes
// =============================================================================

export interface TableContainerProps {
  children: React.ReactNode
  className?: string
}

export function TableContainer({ children, className }: TableContainerProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  )
}

// =============================================================================
// TABLE HEADER - Header da tabela com estilos padrão
// =============================================================================

export interface TableHeaderProps {
  children: React.ReactNode
  className?: string
}

export function TableHeader({ children, className }: TableHeaderProps) {
  return (
    <thead
      className={cn(
        'bg-[var(--ds-bg-surface)]/30 border-b border-[var(--ds-border-subtle)]',
        'text-slate-500 uppercase tracking-widest text-xs',
        className
      )}
    >
      {children}
    </thead>
  )
}

// =============================================================================
// TABLE BODY - Body da tabela com estilos padrão
// =============================================================================

export interface TableBodyProps {
  children: React.ReactNode
  className?: string
}

export function TableBody({ children, className }: TableBodyProps) {
  return (
    <tbody className={cn('divide-y divide-white/5', className)}>
      {children}
    </tbody>
  )
}

// =============================================================================
// TABLE ROW - Row clicável da tabela
// =============================================================================

export interface TableRowProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}

export function TableRow({ children, onClick, className }: TableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:bg-[var(--ds-bg-hover)] hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]',
        className
      )}
    >
      {children}
    </tr>
  )
}

// =============================================================================
// TABLE CELL - Célula da tabela
// =============================================================================

export interface TableCellProps {
  children: React.ReactNode
  className?: string
  header?: boolean
}

export function TableCell({ children, className, header = false }: TableCellProps) {
  const Component = header ? 'th' : 'td'
  return (
    <Component
      className={cn(
        'px-6 py-4',
        header && 'font-medium',
        className
      )}
    >
      {children}
    </Component>
  )
}

// =============================================================================
// EMPTY STATE - Estado vazio da tabela
// =============================================================================

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-4 text-slate-500">{icon}</div>}
      <h3 className="text-lg font-medium text-white mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 mb-4 max-w-md">{description}</p>}
      {action}
    </div>
  )
}

// =============================================================================
// LOADING STATE - Estado de loading da tabela
// =============================================================================

export interface LoadingStateProps {
  rows?: number
  columns?: number
}

export function LoadingState({ rows = 5, columns = 4 }: LoadingStateProps) {
  return (
    <TableContainer>
      <TableHeader>
        <tr>
          {Array.from({ length: columns }).map((_, i) => (
            <TableCell key={i} header>
              <div className="h-4 bg-slate-800 rounded animate-pulse w-20" />
            </TableCell>
          ))}
        </tr>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <tr key={rowIndex}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex}>
                <div
                  className="h-4 bg-slate-800/50 rounded animate-pulse"
                  style={{ width: `${60 + Math.random() * 40}%` }}
                />
              </TableCell>
            ))}
          </tr>
        ))}
      </TableBody>
    </TableContainer>
  )
}
