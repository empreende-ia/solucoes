import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Container } from "./container"

/**
 * StatCard - Card para exibição de métricas e estatísticas
 *
 * Usa os tokens de tipografia do Design System (Stats Display):
 * - .text-stat para números grandes
 * - .text-stat-label para labels
 *
 * Layouts disponíveis:
 * - vertical: ícone no topo, número abaixo, label no final (Dashboard)
 * - horizontal: ícone à esquerda, número e label à direita (Contatos)
 * - compact: versão menor para grids densos
 *
 * @example
 * ```tsx
 * // Layout vertical (padrão - Dashboard style)
 * <StatCard
 *   title="Total Enviado"
 *   value="12,847"
 *   icon={Send}
 *   color="blue"
 * />
 *
 * // Layout horizontal (Contatos style)
 * <StatCard
 *   layout="horizontal"
 *   title="Contatos Ativos"
 *   value="1,234"
 *   icon={Users}
 *   color="purple"
 * />
 *
 * // Com tendência
 * <StatCard
 *   title="Taxa de Entrega"
 *   value="98.5%"
 *   icon={CheckCircle}
 *   color="purple"
 *   trend={{ value: 2.5, direction: "up" }}
 * />
 * ```
 */

const colorStyles = {
  purple: {
    iconBg: "bg-primary-500/15",
    iconColor: "text-primary-600 dark:text-primary-400",
    iconGlow: "shadow-primary-500/20",
  },
  blue: {
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-600 dark:text-blue-400",
    iconGlow: "shadow-blue-500/20",
  },
  red: {
    iconBg: "bg-red-500/15",
    iconColor: "text-red-600 dark:text-red-400",
    iconGlow: "shadow-red-500/20",
  },
  amber: {
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    iconGlow: "shadow-amber-500/20",
  },
  emerald: {
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    iconGlow: "shadow-emerald-500/20",
  },
  gold: {
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    iconGlow: "shadow-amber-500/20",
  },
  slate: {
    iconBg: "bg-slate-500/15",
    iconColor: "text-slate-600 dark:text-slate-400",
    iconGlow: "shadow-slate-500/20",
  },
} as const

type StatColor = keyof typeof colorStyles

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Título/label da métrica */
  title: string
  /** Valor da métrica (já formatado) */
  value: string
  /** Ícone lucide-react */
  icon: LucideIcon
  /** Cor do tema */
  color?: StatColor
  /** Layout do card */
  layout?: "vertical" | "horizontal" | "compact"
  /** Tendência (opcional) */
  trend?: {
    value: number
    direction: "up" | "down" | "neutral"
  }
  /** Se está carregando */
  loading?: boolean
  /** Se é clicável */
  interactive?: boolean
}

function StatCard({
  title,
  value,
  icon: Icon,
  color = "purple",
  layout = "vertical",
  trend,
  loading = false,
  interactive = false,
  className,
  ...props
}: StatCardProps) {
  const styles = colorStyles[color]

  if (loading) {
    return (
      <Container variant="glass" padding="lg" className={className}>
        <StatCardSkeleton layout={layout} />
      </Container>
    )
  }

  if (layout === "horizontal") {
    return (
      <Container
        variant="glass"
        padding="lg"
        hover={interactive}
        className={cn(interactive && "cursor-pointer", className)}
        {...props}
      >
        <div className="flex items-center gap-4">
          {/* Icon */}
          <div
            className={cn(
              "relative p-3 rounded-xl border border-[var(--ds-border-default)]",
              styles.iconBg
            )}
          >
            <Icon size={20} className={styles.iconColor} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-stat-label truncate">{title}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-stat">{value}</span>
              {trend && <TrendIndicator {...trend} />}
            </div>
          </div>
        </div>
      </Container>
    )
  }

  if (layout === "compact") {
    return (
      <Container
        variant="glass"
        padding="md"
        hover={interactive}
        className={cn(interactive && "cursor-pointer", className)}
        {...props}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-2 rounded-lg border border-[var(--ds-border-default)]",
                styles.iconBg
              )}
            >
              <Icon size={16} className={styles.iconColor} />
            </div>
            <p className="text-sm text-[var(--ds-text-secondary)]">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-[var(--ds-text-primary)]">{value}</span>
            {trend && <TrendIndicator {...trend} size="sm" />}
          </div>
        </div>
      </Container>
    )
  }

  // Default: vertical layout
  return (
    <Container
      variant="glass"
      padding="lg"
      hover={interactive}
      className={cn("group", interactive && "cursor-pointer", className)}
      {...props}
    >
      {/* Icon */}
      <div className="flex items-start justify-between mb-6">
        <div
          className={cn(
            "relative p-3 rounded-xl border border-[var(--ds-border-default)]",
            styles.iconBg
          )}
        >
          <div
            className={cn(
              "absolute -inset-2 rounded-2xl opacity-0 blur-lg transition-opacity duration-300",
              "group-hover:opacity-60",
              styles.iconBg
            )}
          />
          <Icon size={20} className={cn(styles.iconColor, "relative")} />
        </div>
        {trend && <TrendIndicator {...trend} />}
      </div>

      {/* Value & Label */}
      <div>
        <h3 className="text-stat">{value}</h3>
        <p className="text-stat-label mt-1">{title}</p>
      </div>
    </Container>
  )
}

interface TrendIndicatorProps {
  value: number
  direction: "up" | "down" | "neutral"
  size?: "sm" | "md"
}

function TrendIndicator({ value, direction, size = "md" }: TrendIndicatorProps) {
  const isPositive = direction === "up"
  const isNegative = direction === "down"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full font-medium",
        size === "sm" ? "text-xs px-1.5 py-0.5" : "text-xs px-2 py-1",
        isPositive && "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
        isNegative && "text-red-600 dark:text-red-400 bg-red-500/10",
        !isPositive && !isNegative && "text-[var(--ds-text-muted)] bg-[var(--ds-bg-surface)]"
      )}
    >
      {isPositive && "↑"}
      {isNegative && "↓"}
      {value}%
    </span>
  )
}

function StatCardSkeleton({ layout }: { layout: string }) {
  if (layout === "horizontal") {
    return (
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[var(--ds-bg-surface)] animate-pulse" />
        <div className="flex-1">
          <div className="w-24 h-4 bg-[var(--ds-bg-surface)] rounded animate-pulse mb-2" />
          <div className="w-16 h-8 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div className="w-12 h-12 rounded-xl bg-[var(--ds-bg-surface)] animate-pulse" />
      </div>
      <div>
        <div className="w-20 h-9 bg-[var(--ds-bg-surface)] rounded mb-2 animate-pulse" />
        <div className="w-28 h-4 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
      </div>
    </>
  )
}

export { StatCard, type StatColor }
