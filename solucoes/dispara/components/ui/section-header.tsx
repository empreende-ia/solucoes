import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * SectionHeader - Header de seção com indicador visual de cor
 *
 * Usado para organizar seções em páginas de configuração e formulários.
 * O indicador de cor ajuda a categorizar visualmente diferentes tipos de seções.
 *
 * Cores disponíveis:
 * - brand (emerald): Configurações principais, features ativas
 * - warning (amber): Configurações opcionais, atenção necessária
 * - info (blue): Informações, documentação
 * - neutral (slate): Seções padrão
 *
 * @example
 * ```tsx
 * // Com indicador de cor
 * <SectionHeader
 *   title="Meta App (opcional)"
 *   description="Habilita validação forte do token"
 *   color="brand"
 *   icon={Settings}
 * />
 *
 * // Sem indicador
 * <SectionHeader
 *   title="Configurações Avançadas"
 *   showIndicator={false}
 * />
 *
 * // Com ações
 * <SectionHeader
 *   title="Webhooks"
 *   icon={Webhook}
 *   color="brand"
 *   actions={<Button size="sm">Configurar</Button>}
 * />
 * ```
 */

const indicatorColors = {
  brand: "bg-primary-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  error: "bg-red-500",
  neutral: "bg-slate-500",
} as const

type IndicatorColor = keyof typeof indicatorColors

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Título da seção */
  title: string
  /** Descrição opcional (pode ser string ou ReactNode para formatação) */
  description?: React.ReactNode
  /** Cor do indicador */
  color?: IndicatorColor
  /** Se deve mostrar o indicador de cor */
  showIndicator?: boolean
  /** Ícone opcional */
  icon?: LucideIcon
  /** Ações à direita (botões, etc) */
  actions?: React.ReactNode
  /** Badge ou tag após o título */
  badge?: React.ReactNode
}

function SectionHeader({
  title,
  description,
  color = "brand",
  showIndicator = true,
  icon: Icon,
  actions,
  badge,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      data-slot="section-header"
      className={cn("flex items-start gap-3", className)}
      {...props}
    >
      {/* Indicator bar */}
      {showIndicator && (
        <div
          className={cn(
            "w-1 self-stretch rounded-full flex-shrink-0",
            indicatorColors[color]
          )}
          aria-hidden="true"
        />
      )}

      {/* Icon */}
      {Icon && (
        <div
          className={cn(
            "flex-shrink-0 mt-0.5",
            color === "brand" && "text-primary-400",
            color === "warning" && "text-amber-400",
            color === "info" && "text-blue-400",
            color === "error" && "text-red-400",
            color === "neutral" && "text-[var(--ds-text-secondary)]"
          )}
        >
          <Icon size={20} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-heading-4 text-[var(--ds-text-primary)]">{title}</h3>
          {badge}
        </div>
        {description && (
          <p className="text-body-small text-[var(--ds-text-secondary)] mt-1">{description}</p>
        )}
      </div>

      {/* Actions */}
      {actions && (
        <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

/**
 * SectionContent - Wrapper para conteúdo de seção com padding alinhado
 */
function SectionContent({
  className,
  hasIndicator = true,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hasIndicator?: boolean }) {
  return (
    <div
      data-slot="section-content"
      className={cn(
        "mt-4",
        hasIndicator && "pl-4", // Alinha com conteúdo após o indicador
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Section - Componente completo de seção (header + content)
 */
function Section({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      data-slot="section"
      className={cn("space-y-4", className)}
      {...props}
    >
      {children}
    </section>
  )
}

export { SectionHeader, SectionContent, Section, type IndicatorColor }
