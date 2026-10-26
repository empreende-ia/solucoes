'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ButtonData } from '../types'

interface UrlButtonFieldsProps {
  button: ButtonData
  index: number
  buttons: ButtonData[]
  updateButtons: (buttons: ButtonData[]) => void
}

export function UrlButtonFields({
  button,
  index,
  buttons,
  updateButtons,
}: UrlButtonFieldsProps) {
  const url = String(button?.url || '')
  const isDynamic = /\{\{\s*\d+\s*\}\}/.test(url)
  const example = (Array.isArray(button?.example) ? button.example[0] : button?.example) || ''

  const handleUrlTypeChange = (v: string) => {
    const next = [...buttons]
    const nextUrl = v === 'dynamic'
      ? (url.includes('{{') ? url : url.replace(/\/$/, '') + '/{{1}}')
      : url.replace(/\{\{\s*\d+\s*\}\}/g, '').replace(/\/+$/, '')
    next[index] = { ...button, url: nextUrl }
    if (v !== 'dynamic') {
      delete next[index].example
    } else {
      next[index].example = Array.isArray(button?.example) ? button.example : [example || 'Exemplo 1']
    }
    updateButtons(next)
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = [...buttons]
    next[index] = { ...button, url: e.target.value }
    updateButtons(next)
  }

  const handleExampleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = [...buttons]
    next[index] = { ...button, example: [e.target.value] }
    updateButtons(next)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-1">
        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Tipo de URL</div>
        <Select value={isDynamic ? 'dynamic' : 'static'} onValueChange={handleUrlTypeChange}>
          <SelectTrigger className="h-11 w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="static">Estatico</SelectItem>
            <SelectItem value="dynamic">Dinamico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">URL do site</div>
        <Input
          value={url}
          onChange={handleUrlChange}
          className="h-11 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
          placeholder="https://www.exemplo.com"
        />
      </div>

      {isDynamic && (
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Exemplo</div>
            <Input
              value={example}
              onChange={handleExampleChange}
              className="h-11 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
              placeholder="Exemplo 1"
            />
          </div>
          <div className="text-xs text-[var(--ds-text-muted)] self-end">
            Use <span className="font-mono">{'{{1}}'}</span> para URL dinamica.
          </div>
        </div>
      )}
    </div>
  )
}
