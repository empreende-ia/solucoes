'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import { Container } from '@/components/ui/container'

interface StepNavigationProps {
  step: number
  setStep: React.Dispatch<React.SetStateAction<number>>
  canContinue: boolean
  isConfigComplete: boolean
  isContentComplete: boolean
  isButtonsValid: boolean
  onFinish?: () => void
  isFinishing?: boolean
  onSaveDraft?: () => void
  isSaving?: boolean
  showDebug: boolean
  setShowDebug: React.Dispatch<React.SetStateAction<boolean>>
  // Validation states for messages
  isHeaderFormatValid: boolean
  isHeaderVariableValid: boolean
  hasInvalidNamed: boolean
  hasDuplicateNamed: boolean
  hasMissingPositional: boolean
  hasInvalidPositional: boolean
  footerHasVariables: boolean
  headerEdgeParameter: { starts: boolean; ends: boolean }
  bodyEdgeParameter: { starts: boolean; ends: boolean }
  hasLengthErrors: boolean
  ltoHeaderInvalid: boolean
  ltoFooterInvalid: boolean
  buttonErrors: string[]
  carouselErrors: string[]
  limitedTimeOfferCategoryInvalid: boolean
  limitedTimeOfferTextTooLong: boolean
  ltoCopyCodeMissing: boolean
  ltoCopyCodeTooLong: boolean
}

export function StepNavigation({
  step,
  setStep,
  canContinue,
  isConfigComplete,
  isContentComplete,
  isButtonsValid,
  onFinish,
  isFinishing,
  onSaveDraft,
  isSaving,
  showDebug,
  setShowDebug,
  isHeaderFormatValid,
  isHeaderVariableValid,
  hasInvalidNamed,
  hasDuplicateNamed,
  hasMissingPositional,
  hasInvalidPositional,
  footerHasVariables,
  headerEdgeParameter,
  bodyEdgeParameter,
  hasLengthErrors,
  ltoHeaderInvalid,
  ltoFooterInvalid,
  buttonErrors,
  carouselErrors,
  limitedTimeOfferCategoryInvalid,
  limitedTimeOfferTextTooLong,
  ltoCopyCodeMissing,
  ltoCopyCodeTooLong,
}: StepNavigationProps) {
  return (
    <Container variant="default" padding="none" className="px-5 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={() => setStep((prev) => Math.max(1, prev - 1))}
          disabled={step === 1}
          className={`text-sm transition ${step === 1 ? 'text-[var(--ds-text-disabled)] cursor-not-allowed' : 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'}`}
        >
          Voltar
        </button>
        <div className="text-center text-xs text-[var(--ds-text-muted)]">
          {step === 1 && !isConfigComplete && 'Complete a configuração para continuar'}
          {step === 2 && !isContentComplete && (
            !isHeaderFormatValid
              ? 'Tipo de cabeçalho inválido'
              : !isHeaderVariableValid
                ? 'Cabeçalho permite apenas 1 variável'
                : hasInvalidNamed
                  ? 'Corrija as variáveis: use minúsculas e underscore'
                : hasDuplicateNamed
                  ? 'Nomes de variável devem ser únicos'
                : hasMissingPositional
                  ? 'Sequência posicional deve começar em {{1}} e não ter buracos'
                : hasInvalidPositional
                  ? 'No modo numérico, use apenas {{1}}, {{2}}...'
                : footerHasVariables
                  ? 'Rodapé não permite variáveis'
                : headerEdgeParameter.starts || headerEdgeParameter.ends
                  ? 'O cabeçalho não pode começar nem terminar com variável'
                : bodyEdgeParameter.starts || bodyEdgeParameter.ends
                  ? 'O corpo não pode começar nem terminar com variável'
                : hasLengthErrors
                  ? 'Revise os limites de caracteres'
                : ltoHeaderInvalid
                  ? 'LTO aceita apenas cabeçalho imagem/vídeo'
                : ltoFooterInvalid
                  ? 'LTO não permite rodapé'
                : 'Preencha o corpo do template para continuar'
          )}
          {step === 3 && (
            isButtonsValid
              ? 'Reveja os botões e envie para aprovação'
              : buttonErrors.length
                ? 'Revise as regras dos botões'
                : carouselErrors.length
                  ? 'Revise o carousel'
                  : limitedTimeOfferCategoryInvalid
                    ? 'LTO so e permitido em Marketing'
                    : limitedTimeOfferTextTooLong || ltoCopyCodeMissing || ltoCopyCodeTooLong || ltoHeaderInvalid || ltoFooterInvalid
                      ? 'Revise o Limited Time Offer'
                      : 'Revise as regras do template'
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Botão Salvar Rascunho */}
          {onSaveDraft && (
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={isSaving || isFinishing}
              className="rounded-full px-4 py-2 text-sm font-medium border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </span>
              ) : (
                'Salvar Rascunho'
              )}
            </button>
          )}

          {/* Botão Continuar/Enviar */}
          <button
            type="button"
            onClick={() => {
              if (!canContinue || isFinishing) return
              if (step < 3) {
                setStep((prev) => Math.min(3, prev + 1))
                return
              }
              // Ultimo passo: delega a acao ao pai (ex.: salvar + enviar)
              onFinish?.()
            }}
            disabled={!canContinue || !!isFinishing}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              !isFinishing && canContinue
                ? 'bg-primary-600 text-white dark:bg-white dark:text-black hover:bg-primary-500 dark:hover:bg-slate-200'
                : 'cursor-not-allowed border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)]'
            }`}
          >
            {step < 3 ? (
              'Continuar'
            ) : isFinishing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando pra Meta...
              </span>
            ) : (
              (onFinish ? 'Enviar pra Meta' : 'Fim')
            )}
          </button>
        </div>
      </div>
    </Container>
  )
}
