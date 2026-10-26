'use client'

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Stepper, Step, StepperProps } from './stepper'
import { Button } from '@/components/ui/button'

/**
 * Dispara Design System - WizardPageLayout
 *
 * Layout padrão para páginas de wizard/formulário multi-step.
 * Estrutura: Header → Stepper → Two-column (Form + Summary)
 *
 * @example
 * ```tsx
 * <WizardPageLayout
 *   title="Nova Campanha"
 *   backHref="/campaigns"
 *   steps={[
 *     { id: 1, label: 'Configuração' },
 *     { id: 2, label: 'Público' },
 *     { id: 3, label: 'Agendamento' },
 *   ]}
 *   currentStep={1}
 *   onStepClick={setCurrentStep}
 *   summary={<CampaignSummary />}
 * >
 *   <StepContent />
 * </WizardPageLayout>
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export interface WizardPageLayoutProps {
  /** Título da página */
  title: string
  /** Descrição opcional */
  description?: string
  /** Link de voltar */
  backHref?: string
  /** Callback de voltar (alternativa a backHref) */
  onBack?: () => void
  /** Label do botão voltar */
  backLabel?: string
  /** Lista de passos */
  steps: Step[]
  /** Passo atual */
  currentStep: number
  /** Callback ao clicar em um passo */
  onStepClick?: (stepId: number) => void
  /** Variante do stepper */
  stepperVariant?: StepperProps['variant']
  /** Conteúdo principal (form) */
  children: React.ReactNode
  /** Painel de resumo (sidebar direita) */
  summary?: React.ReactNode
  /** Ações do footer */
  actions?: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
  /** Se a sidebar de resumo é sticky */
  stickySummary?: boolean
  /** Largura da coluna de resumo */
  summaryWidth?: 'sm' | 'md' | 'lg'
}

const summaryWidthStyles = {
  sm: 'w-[300px]',
  md: 'w-[360px]',
  lg: 'w-[420px]',
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WizardPageLayout({
  title,
  description,
  backHref,
  onBack,
  backLabel = 'Voltar',
  steps,
  currentStep,
  onStepClick,
  stepperVariant = 'default',
  children,
  summary,
  actions,
  className,
  stickySummary = true,
  summaryWidth = 'md',
}: WizardPageLayoutProps) {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else if (backHref) {
      window.location.href = backHref
    }
  }

  return (
    <div className={cn('min-h-screen', className)}>
      {/* Header */}
      <div className="mb-6">
        {/* Back button + Title */}
        <div className="flex items-center gap-4 mb-4">
          {(backHref || onBack) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="text-slate-400 hover:text-white -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {backLabel}
            </Button>
          )}
        </div>

        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            {description && (
              <p className="text-slate-400 mt-1">{description}</p>
            )}
          </div>
        </div>

        {/* Stepper */}
        {steps.length > 0 && (
          <div className="mt-6">
            <Stepper
              steps={steps}
              currentStep={currentStep}
              onStepClick={onStepClick}
              variant={stepperVariant}
            />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Form Area */}
        <div className="flex-1 min-w-0">{children}</div>

        {/* Summary Sidebar */}
        {summary && (
          <div
            className={cn(
              'flex-shrink-0 hidden lg:block',
              summaryWidthStyles[summaryWidth]
            )}
          >
            <div className={stickySummary ? 'sticky top-6' : ''}>{summary}</div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {actions && (
        <div className="mt-8 pt-6 border-t border-[var(--ds-border-subtle)]">{actions}</div>
      )}
    </div>
  )
}

// =============================================================================
// WIZARD CONTENT - Container para conteúdo do passo atual
// =============================================================================

export interface WizardContentProps {
  children: React.ReactNode
  className?: string
}

export function WizardContent({ children, className }: WizardContentProps) {
  return <div className={cn('space-y-6', className)}>{children}</div>
}

// =============================================================================
// WIZARD ACTIONS - Footer padrão com navegação
// =============================================================================

export interface WizardActionsProps {
  /** Callback do botão voltar */
  onBack?: () => void
  /** Callback do botão próximo/salvar */
  onNext?: () => void
  /** Se está no primeiro passo (esconde voltar) */
  isFirstStep?: boolean
  /** Se está no último passo (muda texto) */
  isLastStep?: boolean
  /** Label do botão próximo */
  nextLabel?: string
  /** Label do botão salvar (último passo) */
  saveLabel?: string
  /** Se o botão próximo está desabilitado */
  nextDisabled?: boolean
  /** Se está carregando */
  isLoading?: boolean
  /** Ações extras (entre voltar e próximo) */
  extraActions?: React.ReactNode
  /** Classes CSS adicionais */
  className?: string
}

export function WizardActions({
  onBack,
  onNext,
  isFirstStep = false,
  isLastStep = false,
  nextLabel = 'Próximo',
  saveLabel = 'Salvar',
  nextDisabled = false,
  isLoading = false,
  extraActions,
  className,
}: WizardActionsProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      {/* Left side - Back button */}
      <div>
        {!isFirstStep && onBack && (
          <Button
            variant="outline"
            onClick={onBack}
            disabled={isLoading}
            className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 text-slate-200 hover:bg-[var(--ds-bg-hover)]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        )}
      </div>

      {/* Right side - Extra actions + Next/Save */}
      <div className="flex items-center gap-3">
        {extraActions}
        {onNext && (
          <Button
            onClick={onNext}
            disabled={nextDisabled || isLoading}
            className="bg-primary-500 text-white hover:bg-primary-400"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Processando...
              </>
            ) : (
              isLastStep ? saveLabel : nextLabel
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// STEP INDICATOR - Indicador de progresso compacto
// =============================================================================

export interface StepIndicatorProps {
  currentStep: number
  totalSteps: number
  className?: string
}

export function StepIndicator({
  currentStep,
  totalSteps,
  className,
}: StepIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm text-slate-400">
        Passo {currentStep} de {totalSteps}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={cn(
              'w-2 h-2 rounded-full transition-colors',
              index + 1 <= currentStep ? 'bg-primary-500' : 'bg-slate-700'
            )}
          />
        ))}
      </div>
    </div>
  )
}
