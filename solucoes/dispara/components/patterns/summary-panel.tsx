'use client'

import * as React from 'react'
import { LucideIcon, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Dispara Design System - SummaryPanel
 *
 * Painel lateral para wizards mostrando resumo/preview.
 * Usado para dar feedback visual ao usuário sobre suas escolhas.
 *
 * @example
 * ```tsx
 * <SummaryPanel
 *   title="Resumo da Campanha"
 *   badge={{ label: 'Rascunho', variant: 'warning' }}
 * >
 *   <SummaryItem label="Template" value="promo_natal" />
 *   <SummaryItem label="Público" value="1.234 contatos" />
 *   <SummaryDivider />
 *   <SummaryPreview>
 *     <TemplatePreview ... />
 *   </SummaryPreview>
 * </SummaryPanel>
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SummaryPanelProps {
  /** Título do painel */
  title: string
  /** Ícone opcional no título */
  icon?: LucideIcon
  /** Badge de status */
  badge?: {
    label: string
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  }
  /** Conteúdo do painel */
  children: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
  /** Se o painel é sticky */
  sticky?: boolean
  /** Footer com ações */
  footer?: React.ReactNode
}

const badgeVariants = {
  default: 'bg-slate-800 text-slate-300',
  success: 'bg-green-500/10 text-green-400 border border-green-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border border-red-500/20',
  info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SummaryPanel({
  title,
  icon: Icon,
  badge,
  children,
  className,
  sticky = true,
  footer,
}: SummaryPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]',
        'overflow-hidden',
        sticky && 'sticky top-6',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-5 border-b border-[var(--ds-border-subtle)]">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-slate-400" />}
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        {badge && (
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium',
              badgeVariants[badge.variant || 'default']
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">{children}</div>

      {/* Footer */}
      {footer && (
        <div className="px-5 pb-5 pt-2 border-t border-[var(--ds-border-subtle)]">{footer}</div>
      )}
    </div>
  )
}

// =============================================================================
// SUMMARY ITEM - Linha de resumo (label: value)
// =============================================================================

export interface SummaryItemProps {
  /** Label do item */
  label: string
  /** Valor do item */
  value: React.ReactNode
  /** Ícone opcional */
  icon?: LucideIcon
  /** Classes CSS adicionais */
  className?: string
  /** Se o valor está vazio/pendente */
  pending?: boolean
  /** Tooltip de ajuda */
  hint?: string
}

export function SummaryItem({
  label,
  value,
  icon: Icon,
  className,
  pending = false,
  hint,
}: SummaryItemProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <span className="text-sm text-slate-400">{label}</span>
        {hint && (
          <span title={hint}>
            <Info className="w-3.5 h-3.5 text-slate-600 cursor-help" />
          </span>
        )}
      </div>
      <span
        className={cn(
          'text-sm font-medium text-right',
          pending ? 'text-slate-600 italic' : 'text-white'
        )}
      >
        {pending ? 'Não definido' : value}
      </span>
    </div>
  )
}

// =============================================================================
// SUMMARY GROUP - Grupo de itens com título
// =============================================================================

export interface SummaryGroupProps {
  /** Título do grupo */
  title: string
  /** Conteúdo do grupo */
  children: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
  /** Colapsável */
  collapsible?: boolean
  /** Estado inicial */
  defaultCollapsed?: boolean
}

export function SummaryGroup({
  title,
  children,
  className,
  collapsible = false,
  defaultCollapsed = false,
}: SummaryGroupProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)

  return (
    <div className={cn('space-y-3', className)}>
      <button
        onClick={collapsible ? () => setIsCollapsed(!isCollapsed) : undefined}
        className={cn(
          'text-xs font-medium text-slate-500 uppercase tracking-wider',
          collapsible && 'cursor-pointer hover:text-slate-400 transition-colors'
        )}
        disabled={!collapsible}
      >
        {title}
        {collapsible && (
          <span className="ml-1">{isCollapsed ? '▸' : '▾'}</span>
        )}
      </button>
      {(!collapsible || !isCollapsed) && (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  )
}

// =============================================================================
// SUMMARY DIVIDER - Separador visual
// =============================================================================

export interface SummaryDividerProps {
  className?: string
}

export function SummaryDivider({ className }: SummaryDividerProps) {
  return <div className={cn('h-px bg-[var(--ds-bg-hover)] my-4', className)} />
}

// =============================================================================
// SUMMARY PREVIEW - Container para preview
// =============================================================================

export interface SummaryPreviewProps {
  /** Título da seção de preview */
  title?: string
  /** Conteúdo do preview */
  children: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
  /** Altura máxima com scroll */
  maxHeight?: number
}

export function SummaryPreview({
  title = 'Preview',
  children,
  className,
  maxHeight,
}: SummaryPreviewProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        {title}
      </span>
      <div
        className={cn(
          'rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-4',
          'overflow-auto'
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {children}
      </div>
    </div>
  )
}

// =============================================================================
// SUMMARY ALERT - Alerta/aviso no painel
// =============================================================================

export interface SummaryAlertProps {
  /** Mensagem do alerta */
  message: string
  /** Variante visual */
  variant?: 'info' | 'warning' | 'error' | 'success'
  /** Ícone customizado */
  icon?: LucideIcon
  /** Classes CSS adicionais */
  className?: string
}

const alertVariants = {
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  error: 'bg-red-500/10 border-red-500/20 text-red-400',
  success: 'bg-green-500/10 border-green-500/20 text-green-400',
}

const alertIcons = {
  info: Info,
  warning: Info,
  error: Info,
  success: Info,
}

export function SummaryAlert({
  message,
  variant = 'info',
  icon,
  className,
}: SummaryAlertProps) {
  const IconComponent = icon || alertIcons[variant]

  return (
    <div
      className={cn(
        'flex items-start gap-2 p-3 rounded-lg border',
        alertVariants[variant],
        className
      )}
    >
      <IconComponent className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span className="text-sm">{message}</span>
    </div>
  )
}

// =============================================================================
// SUMMARY STATS - Mini stats no painel
// =============================================================================

export interface SummaryStatsProps {
  /** Lista de stats */
  stats: Array<{
    label: string
    value: string | number
    icon?: LucideIcon
  }>
  /** Classes CSS adicionais */
  className?: string
}

export function SummaryStats({ stats, className }: SummaryStatsProps) {
  return (
    <div
      className={cn(
        'grid gap-3',
        stats.length === 2 && 'grid-cols-2',
        stats.length === 3 && 'grid-cols-3',
        stats.length >= 4 && 'grid-cols-2',
        className
      )}
    >
      {stats.map((stat, index) => (
        <div
          key={index}
          className="p-3 rounded-lg bg-slate-800/50 border border-[var(--ds-border-subtle)] text-center"
        >
          {stat.icon && (
            <stat.icon className="w-4 h-4 text-slate-500 mx-auto mb-1" />
          )}
          <div className="text-lg font-semibold text-white">{stat.value}</div>
          <div className="text-xs text-slate-500">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
