import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * StatusBadge - Badge semântico para status de campanhas e contatos
 *
 * Usa os tokens de cores de status do Design System:
 * - Campaign status: draft, scheduled, sending, completed, paused, failed
 * - Generic status: success, error, warning, info, processing
 */
const statusBadgeVariants = cva(
  [
    "inline-flex items-center justify-center",
    "rounded-full px-2.5 py-0.5",
    "text-xs font-medium",
    "whitespace-nowrap",
    "transition-colors duration-150",
  ].join(" "),
  {
    variants: {
      status: {
        // Generic status
        success: "bg-green-500/10 text-[var(--ds-status-success-text)]",
        error: "bg-red-500/10 text-[var(--ds-status-error-text)]",
        warning: "bg-amber-500/10 text-[var(--ds-status-warning-text)]",
        info: "bg-blue-500/10 text-[var(--ds-status-info-text)]",
        processing: "bg-blue-500/10 text-[var(--ds-status-info-text)] animate-pulse",
        default: "bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]",

        // Campaign status (Dispara specific)
        draft: "bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]",
        scheduled: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
        sending: "bg-blue-500/10 text-[var(--ds-status-info-text)] animate-pulse",
        completed: "bg-green-500/10 text-[var(--ds-status-success-text)]",
        paused: "bg-amber-500/10 text-[var(--ds-status-warning-text)]",
        failed: "bg-red-500/10 text-[var(--ds-status-error-text)]",
      },
      size: {
        sm: "text-[10px] px-2 py-px",
        md: "text-xs px-2.5 py-0.5",
        lg: "text-sm px-3 py-1",
      },
      withDot: {
        true: "gap-1.5",
        false: "",
      },
    },
    defaultVariants: {
      status: "default",
      size: "md",
      withDot: false,
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  /** Exibir ponto colorido à esquerda */
  showDot?: boolean
}

/**
 * StatusBadge para exibir status de campanhas e operações
 *
 * @example
 * ```tsx
 * // Status de campanha
 * <StatusBadge status="sending">Enviando</StatusBadge>
 * <StatusBadge status="completed">Concluída</StatusBadge>
 *
 * // Status genérico
 * <StatusBadge status="success">Entregue</StatusBadge>
 * <StatusBadge status="error">Falhou</StatusBadge>
 *
 * // Com ponto indicador
 * <StatusBadge status="processing" showDot>Processando</StatusBadge>
 * ```
 */
function StatusBadge({
  className,
  status,
  size,
  showDot = false,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        statusBadgeVariants({ status, size, withDot: showDot }),
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            status === "processing" || status === "sending"
              ? "animate-pulse"
              : "",
            // Cor do dot baseado no status
            {
              "bg-green-400": status === "success" || status === "completed",
              "bg-red-400": status === "error" || status === "failed",
              "bg-amber-400": status === "warning" || status === "paused",
              "bg-blue-400": status === "info" || status === "sending" || status === "processing",
              "bg-violet-400": status === "scheduled",
              "bg-slate-400": status === "default" || status === "draft",
            }
          )}
        />
      )}
      {children}
    </span>
  )
}

/**
 * Helper para mapear CampaignStatus enum para status do badge
 */
export const campaignStatusMap = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  SENDING: "sending",
  COMPLETED: "completed",
  PAUSED: "paused",
  FAILED: "failed",
} as const

/**
 * Helper para obter label em português do status
 */
export const statusLabels = {
  draft: "Rascunho",
  scheduled: "Agendada",
  sending: "Enviando",
  completed: "Concluída",
  paused: "Pausada",
  failed: "Falhou",
  success: "Sucesso",
  error: "Erro",
  warning: "Atenção",
  info: "Info",
  processing: "Processando",
  default: "Indefinido",
} as const

export { StatusBadge, statusBadgeVariants }
