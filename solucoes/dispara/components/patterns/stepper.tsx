'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Dispara Design System - Stepper
 *
 * Componente de navegação por passos para wizards e formulários multi-step.
 *
 * @example
 * ```tsx
 * const steps = [
 *   { id: 1, label: 'Configuração' },
 *   { id: 2, label: 'Público' },
 *   { id: 3, label: 'Validação' },
 *   { id: 4, label: 'Agendamento' },
 * ]
 *
 * <Stepper
 *   steps={steps}
 *   currentStep={2}
 *   onStepClick={(step) => setCurrentStep(step)}
 * />
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Step {
  /** ID único do passo (geralmente 1, 2, 3...) */
  id: number
  /** Label exibido no stepper */
  label: string
  /** Descrição opcional do passo */
  description?: string
  /** Se o passo está desabilitado */
  disabled?: boolean
}

export interface StepperProps {
  /** Lista de passos */
  steps: Step[]
  /** Passo atual (1-indexed) */
  currentStep: number
  /** Callback ao clicar em um passo (opcional - se não passar, não é clicável) */
  onStepClick?: (stepId: number) => void
  /** Permitir clicar apenas em passos já visitados */
  allowClickOnlyCompleted?: boolean
  /** Classes CSS adicionais */
  className?: string
  /** Variante visual */
  variant?: 'default' | 'compact'
}

// =============================================================================
// COMPONENT
// =============================================================================

export function Stepper({
  steps,
  currentStep,
  onStepClick,
  allowClickOnlyCompleted = true,
  className,
  variant = 'default',
}: StepperProps) {
  const isCompact = variant === 'compact'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {steps.map((step, index) => {
        const isActive = step.id === currentStep
        const isCompleted = step.id < currentStep
        const isClickable =
          onStepClick &&
          !step.disabled &&
          (!allowClickOnlyCompleted || isCompleted || isActive)

        return (
          <React.Fragment key={step.id}>
            {/* Step Item */}
            <button
              onClick={() => isClickable && onStepClick?.(step.id)}
              disabled={!isClickable}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl transition-all',
                'border',
                // Estados visuais
                isActive && [
                  'bg-primary-500/10 border-primary-500/30',
                  'text-primary-400',
                ],
                isCompleted && [
                  'bg-slate-800/50 border-[var(--ds-border-subtle)]',
                  'text-slate-300',
                ],
                !isActive && !isCompleted && [
                  'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]',
                  'text-slate-500',
                ],
                // Interação
                isClickable && 'cursor-pointer hover:border-[var(--ds-border-default)]',
                !isClickable && 'cursor-default',
                // Compact mode
                isCompact && 'px-3 py-2'
              )}
            >
              {/* Step Number/Check */}
              <div
                className={cn(
                  'flex items-center justify-center rounded-full font-semibold text-sm',
                  isCompact ? 'w-6 h-6 text-xs' : 'w-8 h-8',
                  isActive && 'bg-primary-500 text-white',
                  isCompleted && 'bg-primary-500/20 text-primary-400',
                  !isActive && !isCompleted && 'bg-slate-800 text-slate-500'
                )}
              >
                {isCompleted ? (
                  <Check className={cn(isCompact ? 'w-3 h-3' : 'w-4 h-4')} />
                ) : (
                  step.id
                )}
              </div>

              {/* Step Label */}
              <span
                className={cn(
                  'font-medium uppercase tracking-wide',
                  isCompact ? 'text-xs' : 'text-sm'
                )}
              >
                {step.label}
              </span>
            </button>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-px max-w-8',
                  isCompleted ? 'bg-primary-500/30' : 'bg-[var(--ds-bg-hover)]'
                )}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// =============================================================================
// VERTICAL STEPPER - Variante vertical para mobile ou sidebars
// =============================================================================

export interface VerticalStepperProps extends Omit<StepperProps, 'variant'> {
  /** Mostrar descrição dos passos */
  showDescription?: boolean
}

export function VerticalStepper({
  steps,
  currentStep,
  onStepClick,
  allowClickOnlyCompleted = true,
  className,
  showDescription = false,
}: VerticalStepperProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {steps.map((step, index) => {
        const isActive = step.id === currentStep
        const isCompleted = step.id < currentStep
        const isClickable =
          onStepClick &&
          !step.disabled &&
          (!allowClickOnlyCompleted || isCompleted || isActive)

        return (
          <div key={step.id} className="flex gap-3">
            {/* Indicator Column */}
            <div className="flex flex-col items-center">
              {/* Step Circle */}
              <button
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full',
                  'font-semibold text-sm transition-all',
                  isActive && 'bg-primary-500 text-white',
                  isCompleted && 'bg-primary-500/20 text-primary-400',
                  !isActive && !isCompleted && 'bg-slate-800 text-slate-500',
                  isClickable && 'cursor-pointer hover:ring-2 hover:ring-primary-500/30',
                  !isClickable && 'cursor-default'
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : step.id}
              </button>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'w-px flex-1 min-h-8 my-1',
                    isCompleted ? 'bg-primary-500/30' : 'bg-[var(--ds-bg-hover)]'
                  )}
                />
              )}
            </div>

            {/* Content Column */}
            <div className="flex-1 pb-6">
              <button
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className={cn(
                  'text-left',
                  isClickable && 'cursor-pointer',
                  !isClickable && 'cursor-default'
                )}
              >
                <p
                  className={cn(
                    'font-medium',
                    isActive && 'text-primary-400',
                    isCompleted && 'text-slate-300',
                    !isActive && !isCompleted && 'text-slate-500'
                  )}
                >
                  {step.label}
                </p>
                {showDescription && step.description && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {step.description}
                  </p>
                )}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
