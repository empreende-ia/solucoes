'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import { Container } from '@/components/ui/container'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Tipos de botão suportados pela Meta API para templates
type ButtonType =
  | 'QUICK_REPLY'
  | 'URL'
  | 'PHONE_NUMBER'
  | 'COPY_CODE'
  | 'OTP'
  | 'FLOW'

type Spec = {
  name?: string
  language?: string
  category?: string
  parameter_format?: 'positional' | 'named'
  header?: any
  body?: { text?: string; example?: any }
  footer?: { text?: string } | null
  buttons?: any[]
  limited_time_offer?: any
}

interface StepConfigProps {
  id: string
  spec: Spec
  update: (patch: Partial<Spec>) => void
  variableMode: 'positional' | 'named'
  headerType: string
  headerText: string
  bodyText: string
  footerText: string
  sanitizePlaceholdersByMode: (text: string, mode: 'positional' | 'named') => string
  notifySanitized: () => void
  normalizeButtons: (input: any[]) => any[]
  buttons: any[]
  newButtonForType: (type: ButtonType) => any
  defaultBodyExamples: (text: string) => string[][] | undefined
  stripAllPlaceholders: (text: string) => string
  header: any
  isNameValid: boolean
}

export function StepConfig({
  id,
  spec,
  update,
  variableMode,
  headerType,
  headerText,
  bodyText,
  footerText,
  sanitizePlaceholdersByMode,
  notifySanitized,
  normalizeButtons,
  buttons,
  newButtonForType,
  defaultBodyExamples,
  stripAllPlaceholders,
  header,
  isNameValid,
}: StepConfigProps) {
  return (
    <Container variant="default" padding="lg" className="min-h-140">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-[var(--ds-text-primary)]">Nome e idioma do modelo</div>
          <div className="text-xs text-[var(--ds-text-secondary)] mt-0.5">Defina como o modelo sera identificado.</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ds-text-secondary)]">Nome</label>
          <Input
            value={spec.name || ''}
            onChange={(e) => update({ name: e.target.value })}
            className={`bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] ${
              isNameValid ? 'border-[var(--ds-border-default)]' : 'border-amber-600 dark:border-amber-400/40'
            }`}
          />
          <p className="text-xs text-[var(--ds-text-muted)]">Apenas <span className="font-mono">a-z 0-9 _</span></p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ds-text-secondary)]">Categoria</label>
          <Select
            value={spec.category}
            onValueChange={(v) => {
              const nextCategory = String(v)
              const nextAllowedButtons = new Set<ButtonType>(
                nextCategory === 'AUTHENTICATION'
                  ? ['OTP']
                  : ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE', 'FLOW'],
              )
              const nextButtons = buttons.filter((b) => nextAllowedButtons.has(b?.type as ButtonType))
              if (nextCategory === 'AUTHENTICATION' && nextButtons.length === 0) {
                nextButtons.push(newButtonForType('OTP'))
              }
              update({
                category: v,
                buttons: normalizeButtons(nextButtons),
                limited_time_offer: nextCategory === 'MARKETING' ? spec.limited_time_offer : null,
              })
            }}
          >
            <SelectTrigger className="w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MARKETING">Marketing</SelectItem>
              <SelectItem value="UTILITY">Utilidade</SelectItem>
              <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ds-text-secondary)]">Idioma</label>
          <Select value={spec.language} onValueChange={(v) => update({ language: v })}>
            <SelectTrigger className="w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pt_BR">pt_BR</SelectItem>
              <SelectItem value="en_US">en_US</SelectItem>
              <SelectItem value="es_ES">es_ES</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ds-text-secondary)]">Tipo de variável</label>
          <Select
            value={variableMode}
            onValueChange={(v) => {
              const mode = v as 'positional' | 'named'
              const next: Partial<Spec> = { parameter_format: mode }
              if (headerType === 'TEXT') {
                const cleanedHeader = sanitizePlaceholdersByMode(headerText, mode)
                if (cleanedHeader !== headerText) {
                  next.header = { ...(header || { format: 'TEXT' }), format: 'TEXT', text: cleanedHeader, example: header?.example ?? null }
                  notifySanitized()
                }
              }
              const cleanedBody = sanitizePlaceholdersByMode(bodyText, mode)
              if (cleanedBody !== bodyText) {
                const example = defaultBodyExamples(cleanedBody)
                next.body = { ...(spec.body || {}), text: cleanedBody, example: example ? { body_text: example } : undefined }
                notifySanitized()
              }
              if (spec.footer?.text) {
                const cleanedFooter = stripAllPlaceholders(footerText)
                if (cleanedFooter !== footerText) {
                  next.footer = { ...(spec.footer || {}), text: cleanedFooter }
                  notifySanitized()
                }
              }
              update(next)
            }}
          >
            <SelectTrigger className="w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="positional">Número</SelectItem>
              <SelectItem value="named">Nome (avançado)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 text-xs text-[var(--ds-text-muted)]">
        ID do rascunho: <span className="font-mono">{id}</span>
      </div>
    </Container>
  )
}
