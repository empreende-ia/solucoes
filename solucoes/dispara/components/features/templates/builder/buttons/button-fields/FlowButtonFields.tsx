'use client'

import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ButtonData, Flow } from '../types'

interface FlowButtonFieldsProps {
  button: ButtonData
  index: number
  buttons: ButtonData[]
  updateButtons: (buttons: ButtonData[]) => void
  publishedFlows: Flow[]
  flowsQueryIsLoading: boolean
}

function FlowStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'PUBLISHED'
      ? 'bg-primary-500/15 text-primary-200 border-primary-500/20'
      : status === 'DRAFT'
        ? 'bg-amber-500/15 text-amber-200 border-amber-500/20'
        : 'bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] border-[var(--ds-border-default)]'

  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] ${cls}`}>
      {status}
    </span>
  )
}

export function FlowButtonFields({
  button,
  index,
  buttons,
  updateButtons,
  publishedFlows,
  flowsQueryIsLoading,
}: FlowButtonFieldsProps) {
  const currentFlowId = String(button.flow_id || '')
  const hasMatch = publishedFlows.some((f) => String(f.meta_flow_id || '') === currentFlowId)
  const selectValue = hasMatch ? currentFlowId : ''

  const handleFlowChange = (v: string) => {
    const next = [...buttons]
    next[index] = { ...button, flow_id: v }
    updateButtons(next)
  }

  const handleFlowActionChange = (v: string) => {
    const next = [...buttons]
    next[index] = { ...button, flow_action: v }
    updateButtons(next)
  }

  const getPlaceholder = () => {
    if (flowsQueryIsLoading) return 'Carregando...'
    if (publishedFlows.length === 0) return 'Nenhum MiniApp publicado'
    return 'Selecionar'
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
      <div className="space-y-1">
        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">Escolher MiniApp publicado</div>
        <Select
          value={selectValue}
          onValueChange={handleFlowChange}
          disabled={flowsQueryIsLoading || publishedFlows.length === 0}
        >
          <SelectTrigger className="h-11 w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
            <SelectValue placeholder={getPlaceholder()} />
          </SelectTrigger>
          <SelectContent>
            {publishedFlows.map((f) => (
              <SelectItem key={f.id} value={String(f.meta_flow_id)}>
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="truncate">{f.name} * {String(f.meta_flow_id)}</span>
                  <FlowStatusBadge status={f.meta_status ? String(f.meta_status) : 'DESCONHECIDO'} />
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!hasMatch && currentFlowId && (
          <div className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">
            O MiniApp atual nao esta publicado. Selecione um da lista.
          </div>
        )}
        <div className="mt-3 text-[11px] text-[var(--ds-text-muted)]">
          Dica: publique o MiniApp no Builder para aparecer na lista.
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-[var(--ds-text-secondary)]">flow_action</div>
        <Select value={button.flow_action || 'navigate'} onValueChange={handleFlowActionChange}>
          <SelectTrigger className="h-11 w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="navigate">navigate</SelectItem>
            <SelectItem value="data_exchange">data_exchange</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
