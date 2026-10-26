import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Dispara Design System - FormSection
 *
 * Seção de formulário com título, descrição e conteúdo.
 * Usado para agrupar campos relacionados em formulários e wizards.
 *
 * @example
 * ```tsx
 * <FormSection
 *   title="Template"
 *   description="Busque e escolha o template da campanha."
 * >
 *   <TemplateSelector ... />
 * </FormSection>
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export interface FormSectionProps {
  /** Título da seção */
  title: string
  /** Descrição da seção */
  description?: string
  /** Conteúdo da seção */
  children: React.ReactNode
  /** Se a seção está colapsável */
  collapsible?: boolean
  /** Estado inicial do collapse (se collapsible=true) */
  defaultCollapsed?: boolean
  /** Classes CSS adicionais */
  className?: string
  /** Classes CSS para o container do conteúdo */
  contentClassName?: string
  /** Ações no header da seção (botões, links) */
  headerActions?: React.ReactNode
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FormSection({
  title,
  description,
  children,
  collapsible = false,
  defaultCollapsed = false,
  className,
  contentClassName,
  headerActions,
}: FormSectionProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]',
        'overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-start justify-between gap-4 p-5',
          collapsible && 'cursor-pointer hover:bg-[var(--ds-bg-hover)] transition-colors'
        )}
        onClick={collapsible ? () => setIsCollapsed(!isCollapsed) : undefined}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description && (
            <p className="text-sm text-slate-400 mt-1">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {headerActions}
          {collapsible && (
            <button
              className={cn(
                'p-1 rounded-lg text-slate-400 hover:text-white transition-transform',
                isCollapsed && 'rotate-180'
              )}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {(!collapsible || !isCollapsed) && (
        <div
          className={cn(
            'px-5 pb-5',
            contentClassName
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// FORM FIELD - Campo individual com label
// =============================================================================

export interface FormFieldProps {
  /** Label do campo */
  label: string
  /** Se o campo é obrigatório */
  required?: boolean
  /** Mensagem de erro */
  error?: string
  /** Texto de ajuda */
  hint?: string
  /** Conteúdo (input, select, etc) */
  children: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
}

export function FormField({
  label,
  required = false,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-sm font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-slate-500">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

// =============================================================================
// FORM ROW - Linha com múltiplos campos
// =============================================================================

export interface FormRowProps {
  children: React.ReactNode
  /** Número de colunas */
  columns?: 2 | 3 | 4
  className?: string
}

const columnStyles = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

export function FormRow({ children, columns = 2, className }: FormRowProps) {
  return (
    <div className={cn('grid gap-4', columnStyles[columns], className)}>
      {children}
    </div>
  )
}

// =============================================================================
// FORM DIVIDER - Separador visual entre seções
// =============================================================================

export interface FormDividerProps {
  /** Texto opcional no divider */
  text?: string
  className?: string
}

export function FormDivider({ text, className }: FormDividerProps) {
  if (text) {
    return (
      <div className={cn('flex items-center gap-4 my-6', className)}>
        <div className="flex-1 h-px bg-[var(--ds-bg-hover)]" />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          {text}
        </span>
        <div className="flex-1 h-px bg-[var(--ds-bg-hover)]" />
      </div>
    )
  }

  return <div className={cn('h-px bg-[var(--ds-bg-hover)] my-6', className)} />
}
