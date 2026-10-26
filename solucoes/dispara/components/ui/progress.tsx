import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Progress - Barra de progresso com cores do Design System
 *
 * Variantes de cor:
 * - brand (emerald): Progresso padrão, positivo
 * - info (blue): Informativo, neutro
 * - warning (amber): Atenção, limite próximo
 * - error (red): Erro, acima do limite
 * - neutral (slate): Desabilitado, inativo
 *
 * @example
 * ```tsx
 * // Progresso padrão
 * <Progress value={75} />
 *
 * // Com cor de warning quando próximo do limite
 * <Progress value={90} color="warning" />
 *
 * // Com label
 * <Progress value={50} showLabel />
 *
 * // Determinando cor automaticamente baseado no valor
 * <Progress value={95} autoColor thresholds={{ warning: 80, error: 95 }} />
 * ```
 */

const progressVariants = cva(
  "h-full w-full flex-1 rounded-full [transition:var(--ds-transition-normal)]",
  {
    variants: {
      color: {
        brand: "bg-primary-500",
        info: "bg-blue-500",
        warning: "bg-amber-500",
        error: "bg-red-500",
        neutral: "bg-slate-500",
      },
    },
    defaultVariants: {
      color: "brand",
    },
  }
)

const trackVariants = cva(
  "relative h-2 w-full overflow-hidden rounded-full",
  {
    variants: {
      color: {
        brand: "bg-primary-500/20",
        info: "bg-blue-500/20",
        warning: "bg-amber-500/20",
        error: "bg-red-500/20",
        neutral: "bg-slate-500/20",
      },
      size: {
        sm: "h-1",
        md: "h-2",
        lg: "h-3",
      },
    },
    defaultVariants: {
      color: "brand",
      size: "md",
    },
  }
)

type ProgressColor = "brand" | "info" | "warning" | "error" | "neutral"

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof trackVariants> {
  /** Cor da barra de progresso */
  color?: ProgressColor
  /** Mostrar label com porcentagem */
  showLabel?: boolean
  /** Posição do label */
  labelPosition?: "right" | "top"
  /** Determinar cor automaticamente baseado no valor */
  autoColor?: boolean
  /** Thresholds para autoColor (em porcentagem) */
  thresholds?: {
    warning?: number
    error?: number
  }
  /** Formato do label */
  formatLabel?: (value: number) => string
}

function Progress({
  className,
  value = 0,
  color = "brand",
  size,
  showLabel = false,
  labelPosition = "right",
  autoColor = false,
  thresholds = { warning: 80, error: 95 },
  formatLabel,
  ...props
}: ProgressProps) {
  // Determina cor automaticamente se autoColor está habilitado
  const resolvedColor = React.useMemo(() => {
    if (!autoColor) return color

    const currentValue = value || 0
    if (thresholds.error && currentValue >= thresholds.error) return "error"
    if (thresholds.warning && currentValue >= thresholds.warning) return "warning"
    return "brand"
  }, [autoColor, color, value, thresholds])

  const label = formatLabel
    ? formatLabel(value || 0)
    : `${Math.round(value || 0)}%`

  const progressBar = (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(trackVariants({ color: resolvedColor, size }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(progressVariants({ color: resolvedColor }))}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )

  if (!showLabel) {
    return progressBar
  }

  if (labelPosition === "top") {
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-[var(--ds-text-secondary)]">Progresso</span>
          <span
            className={cn(
              "font-medium",
              resolvedColor === "brand" && "text-primary-400",
              resolvedColor === "info" && "text-blue-400",
              resolvedColor === "warning" && "text-amber-400",
              resolvedColor === "error" && "text-red-400",
              resolvedColor === "neutral" && "text-[var(--ds-text-secondary)]"
            )}
          >
            {label}
          </span>
        </div>
        {progressBar}
      </div>
    )
  }

  // labelPosition === "right"
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">{progressBar}</div>
      <span
        className={cn(
          "text-xs font-medium min-w-[3rem] text-right",
          resolvedColor === "brand" && "text-primary-400",
          resolvedColor === "info" && "text-blue-400",
          resolvedColor === "warning" && "text-amber-400",
          resolvedColor === "error" && "text-red-400",
          resolvedColor === "neutral" && "text-[var(--ds-text-secondary)]"
        )}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * ProgressWithLimits - Progress bar que mostra uso vs limite
 *
 * @example
 * ```tsx
 * <ProgressWithLimits
 *   current={7500}
 *   limit={10000}
 *   label="Mensagens"
 * />
 * ```
 */
interface ProgressWithLimitsProps {
  current: number
  limit: number
  label?: string
  formatValue?: (value: number) => string
  className?: string
}

function ProgressWithLimits({
  current,
  limit,
  label,
  formatValue = (v) => v.toLocaleString("pt-BR"),
  className,
}: ProgressWithLimitsProps) {
  const percentage = Math.min((current / limit) * 100, 100)

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="flex justify-between text-sm">
          <span className="text-[var(--ds-text-secondary)]">{label}</span>
          <span className="text-[var(--ds-text-secondary)]">
            {formatValue(current)}{" "}
            <span className="text-[var(--ds-text-muted)]">/ {formatValue(limit)}</span>
          </span>
        </div>
      )}
      <Progress
        value={percentage}
        autoColor
        thresholds={{ warning: 75, error: 90 }}
      />
    </div>
  )
}

export { Progress, ProgressWithLimits, progressVariants, trackVariants }
