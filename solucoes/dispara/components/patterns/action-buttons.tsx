import * as React from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, ButtonProps } from '@/components/ui/button'

/**
 * Dispara Design System - Action Buttons
 *
 * Botões padronizados para ações em páginas.
 * Define hierarquia visual consistente.
 *
 * Hierarquia:
 * 1. PrimaryAction - Ação principal (verde, filled)
 * 2. SecondaryAction - Ações secundárias (outline)
 * 3. DestructiveAction - Ações perigosas (vermelho)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ActionButtonProps extends Omit<ButtonProps, 'variant'> {
  /** Ícone do Lucide */
  icon?: LucideIcon
  /** Posição do ícone */
  iconPosition?: 'left' | 'right'
}

// =============================================================================
// PRIMARY ACTION - Ação principal (verde filled)
// =============================================================================

export function PrimaryAction({
  icon: Icon,
  iconPosition = 'left',
  children,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      className={cn(
        'bg-primary-500 text-white hover:bg-primary-400',
        'transition-all duration-200',
        className
      )}
      {...props}
    >
      {Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
      {children}
      {Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
    </Button>
  )
}

// =============================================================================
// SECONDARY ACTION - Ação secundária (outline)
// =============================================================================

export function SecondaryAction({
  icon: Icon,
  iconPosition = 'left',
  children,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 text-slate-200',
        'hover:bg-[var(--ds-bg-hover)] hover:text-white',
        'transition-all duration-200',
        className
      )}
      {...props}
    >
      {Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
      {children}
      {Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
    </Button>
  )
}

// =============================================================================
// DESTRUCTIVE ACTION - Ação perigosa (vermelho)
// =============================================================================

export function DestructiveAction({
  icon: Icon,
  iconPosition = 'left',
  children,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        'border-red-500/30 bg-red-500/10 text-red-400',
        'hover:bg-red-500/20 hover:border-red-500/50',
        'transition-all duration-200',
        className
      )}
      {...props}
    >
      {Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
      {children}
      {Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
    </Button>
  )
}

// =============================================================================
// HIGHLIGHT ACTION - Ação em destaque (amarelo/chamativo)
// =============================================================================

export function HighlightAction({
  icon: Icon,
  iconPosition = 'left',
  children,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      className={cn(
        'bg-amber-500 text-black hover:bg-amber-400',
        'font-semibold',
        'transition-all duration-200',
        className
      )}
      {...props}
    >
      {Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
      {children}
      {Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
    </Button>
  )
}

// =============================================================================
// ICON ACTION - Botão apenas com ícone (para ações de linha)
// =============================================================================

export interface IconActionProps extends Omit<ButtonProps, 'variant' | 'size'> {
  /** Ícone do Lucide */
  icon: LucideIcon
  /** Variante visual */
  variant?: 'default' | 'destructive' | 'success'
  /** Label para acessibilidade */
  label: string
}

const iconVariantStyles = {
  default: 'text-slate-400 hover:text-white hover:bg-[var(--ds-bg-hover)]',
  destructive: 'text-slate-400 hover:text-red-400 hover:bg-red-500/10',
  success: 'text-slate-400 hover:text-green-400 hover:bg-green-500/10',
}

export function IconAction({
  icon: Icon,
  variant = 'default',
  label,
  className,
  ...props
}: IconActionProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'h-8 w-8 rounded-lg transition-all duration-200',
        iconVariantStyles[variant],
        className
      )}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon className="w-4 h-4" />
    </Button>
  )
}

// =============================================================================
// ACTION GROUP - Container para agrupar botões de ação
// =============================================================================

export interface ActionGroupProps {
  children: React.ReactNode
  className?: string
}

export function ActionGroup({ children, className }: ActionGroupProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {children}
    </div>
  )
}
