import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Container com Design System
 *
 * Substitui as ~173 ocorrencias de:
 * - rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]
 * - bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)]
 *
 * Variantes:
 * - default: fundo elevado com borda sutil
 * - elevated: fundo mais claro com sombra maior
 * - glass: efeito glassmorphism com backdrop-blur
 * - surface: fundo sólido sem transparência
 */
const containerVariants = cva(
  [
    "rounded-2xl",
    "transition-all duration-200",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-[var(--ds-bg-elevated)]",
          "border border-[var(--ds-border-default)]",
        ].join(" "),
        elevated: [
          "bg-[var(--ds-bg-surface)]",
          "border border-[var(--ds-border-default)]",
          "shadow-md",
        ].join(" "),
        glass: [
          "glass-panel",
        ].join(" "),
        surface: [
          "bg-[var(--ds-bg-elevated)]",
          "border border-[var(--ds-border-default)]",
        ].join(" "),
        subtle: [
          "bg-[var(--ds-bg-base)]",
          "border border-[var(--ds-border-subtle)]",
        ].join(" "),
      },
      padding: {
        none: "",
        sm: "p-3",
        md: "p-4",
        lg: "p-6",
        xl: "p-8",
      },
      hover: {
        true: [
          "hover:shadow-[0_4px_16px_rgba(16,185,129,0.1)]",
          "hover:border-primary-500/20",
        ].join(" "),
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
      hover: false,
    },
  }
)

export interface ContainerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {}

/**
 * Container genérico com estilos do Design System
 *
 * @example
 * ```tsx
 * // Container padrão
 * <Container>Conteúdo aqui</Container>
 *
 * // Container com hover
 * <Container hover>Card clicável</Container>
 *
 * // Container glass
 * <Container variant="glass" padding="lg">Modal content</Container>
 * ```
 */
function Container({
  className,
  variant,
  padding,
  hover,
  ...props
}: ContainerProps) {
  return (
    <div
      data-slot="container"
      className={cn(containerVariants({ variant, padding, hover }), className)}
      {...props}
    />
  )
}

export { Container, containerVariants }
