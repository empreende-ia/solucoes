'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import { GripVertical, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ButtonData, ButtonType, Flow } from './types'
import { REQUIRES_BUTTON_TEXT, BUTTON_TYPE_LABELS, TYPES_THAT_RESET_TEXT } from './constants'
import { UrlButtonFields } from './button-fields/UrlButtonFields'
import { PhoneButtonFields } from './button-fields/PhoneButtonFields'
import { CopyCodeButtonFields } from './button-fields/CopyCodeButtonFields'
import { FlowButtonFields } from './button-fields/FlowButtonFields'

interface CTAButtonListProps {
  buttons: ButtonData[]
  updateButtons: (buttons: ButtonData[]) => void
  allowedButtonTypes: Set<ButtonType>
  maxButtonText: number
  clampText: (value: string, max: number) => string
  countChars: (value: unknown) => number
  splitPhone: (phone: string) => { country: string; number: string }
  joinPhone: (country: string, number: string) => string
  publishedFlows: Flow[]
  flowsQueryIsLoading: boolean
  isLimitedTimeOffer: boolean
}

function getInitialButtonState(type: ButtonType, previousButton: ButtonData): ButtonData {
  const newButton: ButtonData = { type }

  if (TYPES_THAT_RESET_TEXT.includes(type)) {
    newButton.text = ''
  }

  if (type === 'URL') {
    newButton.url = 'https://'
  }

  if (type === 'PHONE_NUMBER') {
    newButton.phone_number = ''
  }

  if (type === 'COPY_CODE') {
    newButton.text = 'Copiar código'
    newButton.example = 'CODE123'
  }

  if (type === 'OTP') {
    newButton.text = 'Copiar código'
    newButton.otp_type = 'COPY_CODE'
  }

  if (type === 'FLOW') {
    newButton.flow_id = ''
  }

  return newButton
}

export function CTAButtonList({
  buttons,
  updateButtons,
  allowedButtonTypes,
  maxButtonText,
  clampText,
  countChars,
  splitPhone,
  joinPhone,
  publishedFlows,
  flowsQueryIsLoading,
  isLimitedTimeOffer,
}: CTAButtonListProps) {
  const rows = buttons
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => b?.type !== 'QUICK_REPLY')

  if (rows.length === 0) return null

  const handleTypeChange = (idx: number, b: ButtonData, newType: ButtonType) => {
    if (!allowedButtonTypes.has(newType)) return
    const next = [...buttons]
    next[idx] = getInitialButtonState(newType, b)
    updateButtons(next)
  }

  const handleTextChange = (idx: number, b: ButtonData, value: string) => {
    const next = [...buttons]
    next[idx] = { ...b, text: clampText(value, maxButtonText) }
    updateButtons(next)
  }

  const handleRemove = (idx: number) => {
    updateButtons(buttons.filter((_, i) => i !== idx))
  }

  const renderBodyFields = (b: ButtonData, idx: number) => {
    const type = b?.type as ButtonType

    if (type === 'URL') {
      return (
        <UrlButtonFields
          button={b}
          index={idx}
          buttons={buttons}
          updateButtons={updateButtons}
        />
      )
    }

    if (type === 'PHONE_NUMBER') {
      return (
        <PhoneButtonFields
          button={b}
          index={idx}
          buttons={buttons}
          updateButtons={updateButtons}
          splitPhone={splitPhone}
          joinPhone={joinPhone}
        />
      )
    }

    if (type === 'COPY_CODE') {
      return (
        <CopyCodeButtonFields
          button={b}
          index={idx}
          buttons={buttons}
          updateButtons={updateButtons}
          isLimitedTimeOffer={isLimitedTimeOffer}
          clampText={clampText}
        />
      )
    }

    if (type === 'FLOW') {
      return (
        <FlowButtonFields
          button={b}
          index={idx}
          buttons={buttons}
          updateButtons={updateButtons}
          publishedFlows={publishedFlows}
          flowsQueryIsLoading={flowsQueryIsLoading}
        />
      )
    }

    return null
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ds-text-secondary)]">
        Chamada para ação <span className="text-[var(--ds-text-muted)]">* Opcional</span>
      </div>

      <div className="space-y-4">
        {rows.map(({ b, idx }, rowIndex) => {
          const type = b?.type as ButtonType
          const buttonText = String(b?.text || '')
          const hasTextError = REQUIRES_BUTTON_TEXT.has(type) && !buttonText.trim()
          const rowClassName = rowIndex === 0
            ? 'relative pb-4 pr-12'
            : 'relative border-t border-[var(--ds-border-default)] pt-4 pb-4 pr-12'

          const bodyFields = renderBodyFields(b, idx)

          return (
            <div key={idx} className={rowClassName}>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="absolute right-4 top-4 h-9 w-9 inline-flex items-center justify-center rounded-md text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                title="Remover"
                aria-label="Remover"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-4">
                {/* Header Row */}
                <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-4">
                  <div className="pt-6">
                    <GripVertical className="w-4 h-4 text-[var(--ds-text-muted)]" />
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Tipo de ação</div>
                        <Select
                          value={type}
                          onValueChange={(v) => handleTypeChange(idx, b, v as ButtonType)}
                        >
                          <SelectTrigger className="h-11 w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(BUTTON_TYPE_LABELS)
                              .filter(([key]) => key !== 'QUICK_REPLY')
                              .map(([key, label]) => (
                                <SelectItem
                                  key={key}
                                  value={key}
                                  disabled={!allowedButtonTypes.has(key as ButtonType)}
                                >
                                  {label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Texto do botão</div>
                        <div className="relative">
                          <Input
                            value={buttonText}
                            onChange={(e) => handleTextChange(idx, b, e.target.value)}
                            className="h-11 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)] pr-16"
                            maxLength={maxButtonText}
                            placeholder={type === 'URL' ? 'Visualizar' : 'Texto'}
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ds-text-muted)]">
                            {countChars(buttonText)}/{maxButtonText}
                          </div>
                          {hasTextError && (
                            <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">Informe o texto do botão.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body Fields */}
                {bodyFields && (
                  <div className="pl-8.5">
                    {bodyFields}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        <div className="text-xs text-[var(--ds-text-muted)]">
          Regras: URL max 2, Ligar max 1, Copiar código max 1, OTP max 1; Respostas rápidas ficam agrupadas.
        </div>
      </div>
    </div>
  )
}
