import * as React from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Dispara Design System - StatsCard
 *
 * Card de estatística para exibir métricas numéricas.
 * Usado em páginas de listagem para mostrar totais e KPIs.
 *
 * @example
 * ```tsx
 * <StatsCard
 *   icon={Users}
 *   label="Total de Contatos"
 *   value={1234}
 *   variant="default"
 * />
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export type StatsCardVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

export interface StatsCardProps {
  /** Ícone do Lucide para representar a métrica */
  icon: LucideIcon
  /** Label descritivo da métrica (ex: "Total de Contatos") */
  label: string
  /** Valor numérico ou string formatada */
  value: number | string
  /** Variante visual (afeta cor do ícone) */
  variant?: StatsCardVariant
  /** Classes CSS adicionais */
  className?: string
  /** Callback ao clicar no card (opcional) */
  onClick?: () => void
}

// =============================================================================
// VARIANT STYLES
// =============================================================================

const variantStyles: Record<StatsCardVariant, { icon: string; bg: string }> = {
  default: {
    icon: 'text-primary-400',
    bg: 'bg-primary-500/10',
  },
  success: {
    icon: 'text-primary-400',
    bg: 'bg-primary-500/10',
  },
  warning: {
    icon: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  error: {
    icon: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  info: {
    icon: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
}

// =============================================================================
// COMPONENT
// =============================================================================

export function StatsCard({
  icon: Icon,
  label,
  value,
  variant = 'default',
  className,
  onClick,
}: StatsCardProps) {
  const styles = variantStyles[variant]
  const isClickable = !!onClick

  const formattedValue = typeof value === 'number'
    ? value.toLocaleString('pt-BR')
    : value

  return (
    <div
      className={cn(
        // Base styles
        'flex items-center gap-4 p-5 rounded-2xl',
        'bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)]',
        'transition-all duration-200',
        // Hover state
        isClickable && 'cursor-pointer hover:bg-slate-900/80 hover:border-white/15',
        className
      )}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick?.() : undefined}
    >
      {/* Icon Container */}
      <div className={cn('p-3 rounded-xl', styles.bg)}>
        <Icon className={cn('w-5 h-5', styles.icon)} />
      </div>

      {/* Content */}
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider truncate">
          {label}
        </span>
        <span className="text-2xl font-bold text-white tabular-nums">
          {formattedValue}
        </span>
      </div>
    </div>
  )
}

// =============================================================================
// STATS ROW - Container para múltiplos StatsCards
// =============================================================================

export interface StatsRowProps {
  /** Children devem ser StatsCard components */
  children: React.ReactNode
  /** Número de colunas no grid (responsive por padrão) */
  columns?: 2 | 3 | 4
  /** Classes CSS adicionais */
  className?: string
}

const columnStyles = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

export function StatsRow({ children, columns = 3, className }: StatsRowProps) {
  return (
    <div className={cn('grid gap-4', columnStyles[columns], className)}>
      {children}
    </div>
  )
}
