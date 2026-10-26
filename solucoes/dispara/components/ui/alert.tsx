import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Alert - Componente para feedback e mensagens contextuais
 *
 * Usa os tokens de cores de status do Design System:
 * - success: Confirmações, ações bem-sucedidas
 * - warning: Avisos, atenção necessária
 * - error: Erros, falhas
 * - info: Informações neutras
 *
 * @example
 * ```tsx
 * <Alert variant="success">
 *   <AlertTitle>Pronto para usar!</AlertTitle>
 *   <AlertDescription>O endpoint foi configurado automaticamente.</AlertDescription>
 * </Alert>
 *
 * <Alert variant="warning" dismissible onDismiss={() => {}}>
 *   <AlertTitle>Webhook apontando para outro sistema</AlertTitle>
 *   <AlertDescription>Os status não serão atualizados.</AlertDescription>
 * </Alert>
 * ```
 */

const alertVariants = cva(
  [
    "relative w-full rounded-lg p-4",
    "[transition:var(--ds-transition-fast)]",
    "flex gap-3",
  ].join(" "),
  {
    variants: {
      variant: {
        success: [
          "[background-color:var(--ds-status-success-bg)]",
          "[border:1px_solid_rgba(16,185,129,0.3)]",
          "[color:var(--ds-status-success-text)]",
        ].join(" "),
        warning: [
          "[background-color:var(--ds-status-warning-bg)]",
          "[border:1px_solid_rgba(245,158,11,0.3)]",
          "[color:var(--ds-status-warning-text)]",
        ].join(" "),
        error: [
          "[background-color:var(--ds-status-error-bg)]",
          "[border:1px_solid_rgba(239,68,68,0.3)]",
          "[color:var(--ds-status-error-text)]",
        ].join(" "),
        info: [
          "[background-color:var(--ds-status-info-bg)]",
          "[border:1px_solid_rgba(59,130,246,0.3)]",
          "[color:var(--ds-status-info-text)]",
        ].join(" "),
        default: [
          "bg-[var(--ds-bg-elevated)]",
          "[border:1px_solid_var(--ds-border-default)]",
          "text-[var(--ds-text-secondary)]",
        ].join(" "),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const alertIconMap = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
  default: Info,
}

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Se o alert pode ser fechado */
  dismissible?: boolean
  /** Callback quando o alert é fechado */
  onDismiss?: () => void
  /** Ocultar ícone */
  hideIcon?: boolean
}

function Alert({
  className,
  variant = "default",
  dismissible = false,
  onDismiss,
  hideIcon = false,
  children,
  ...props
}: AlertProps) {
  const Icon = alertIconMap[variant || "default"]

  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {!hideIcon && (
        <Icon
          className="h-5 w-5 flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">{children}</div>
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "flex-shrink-0 p-1 rounded-md -m-1",
            "opacity-70 hover:opacity-100",
            "[transition:var(--ds-transition-fast)]",
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            variant === "success" && "focus:ring-green-500",
            variant === "warning" && "focus:ring-amber-500",
            variant === "error" && "focus:ring-red-500",
            variant === "info" && "focus:ring-blue-500",
          )}
          aria-label="Fechar alerta"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="alert-description"
      className={cn("text-sm mt-1 opacity-90", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
