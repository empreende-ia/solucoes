'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import { GripVertical, X } from 'lucide-react'
import { ButtonData } from './types'
import { REQUIRES_BUTTON_TEXT } from './constants'

interface QuickReplyButtonListProps {
  buttons: ButtonData[]
  updateButtons: (buttons: ButtonData[]) => void
  maxButtonText: number
  clampText: (value: string, max: number) => string
  countChars: (value: unknown) => number
}

export function QuickReplyButtonList({
  buttons,
  updateButtons,
  maxButtonText,
  clampText,
  countChars,
}: QuickReplyButtonListProps) {
  const rows = buttons
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => b?.type === 'QUICK_REPLY')

  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ds-text-secondary)]">
        Resposta rapida <span className="text-[var(--ds-text-muted)]">* Opcional</span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-[18px_minmax(0,1fr)_40px] gap-3 items-center">
          <div />
          <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Texto do botão</div>
          <div />
        </div>

        <div className="space-y-3">
          {rows.map(({ b, idx }) => {
            const text = String(b?.text || '')
            const hasTextError = REQUIRES_BUTTON_TEXT.has(b?.type) && !text.trim()
            
            return (
              <div key={idx} className="grid grid-cols-[18px_minmax(0,1fr)_40px] gap-3 items-center">
                <GripVertical className="w-4 h-4 text-[var(--ds-text-muted)]" />

                <div className="relative">
                  <Input
                    value={text}
                    onChange={(e) => {
                      const next = [...buttons]
                      next[idx] = { ...b, text: clampText(e.target.value, maxButtonText) }
                      updateButtons(next)
                    }}
                    className="h-11 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)] pr-16"
                    maxLength={maxButtonText}
                    placeholder="Quick Reply"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ds-text-muted)]">
                    {countChars(text)}/{maxButtonText}
                  </div>
                  {hasTextError && (
                    <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">Informe o texto do botão.</div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => updateButtons(buttons.filter((_, i) => i !== idx))}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                  title="Remover"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
