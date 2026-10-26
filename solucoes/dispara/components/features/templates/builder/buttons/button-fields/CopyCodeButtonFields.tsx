'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import { ButtonData } from '../types'

interface CopyCodeButtonFieldsProps {
  button: ButtonData
  index: number
  buttons: ButtonData[]
  updateButtons: (buttons: ButtonData[]) => void
  isLimitedTimeOffer: boolean
  clampText: (value: string, max: number) => string
}

export function CopyCodeButtonFields({
  button,
  index,
  buttons,
  updateButtons,
  isLimitedTimeOffer,
  clampText,
}: CopyCodeButtonFieldsProps) {
  const maxCodeLength = isLimitedTimeOffer ? 15 : 20
  const code = String((Array.isArray(button?.example) ? button.example[0] : button?.example) || '')

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = [...buttons]
    next[index] = { ...button, example: clampText(e.target.value, maxCodeLength) }
    updateButtons(next)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
      <div className="space-y-1">
        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Código da oferta (max {maxCodeLength})</div>
        <Input
          value={code}
          onChange={handleCodeChange}
          className="h-11 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
          placeholder="1234"
        />
      </div>
      <div className="text-xs text-[var(--ds-text-muted)]">
        O código é exibido ao usuário e pode ser copiado.
      </div>
    </div>
  )
}
