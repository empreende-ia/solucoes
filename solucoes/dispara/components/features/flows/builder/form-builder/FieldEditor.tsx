'use client'

import React from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import { FlowFormFieldType, FlowFormOption, normalizeFlowFieldName } from '@/lib/flow-form'
import { FIELD_TYPE_LABEL, FieldEditorProps } from './types'
import { createDefaultOptions, fieldTypeRequiresOptions } from './utils'

export function FieldEditor({
  field,
  index,
  totalFields,
  questionRef,
  onUpdate,
  onMove,
  onDuplicate,
  onRemove,
}: FieldEditorProps) {
  const showOptions = fieldTypeRequiresOptions(field.type)

  const handleTypeChange = (nextType: FlowFormFieldType) => {
    const base: any = { type: nextType }

    if (nextType === 'optin') {
      base.required = false
      base.text = field.text || 'Quero receber mensagens.'
      delete base.options
    }

    if (fieldTypeRequiresOptions(nextType)) {
      base.required = false
      base.options = field.options?.length > 0 ? field.options : createDefaultOptions()
    }

    if (nextType === 'date') {
      base.required = true
      delete base.options
    }

    onUpdate(index, base)
  }

  const handleLabelChange = (nextLabel: string) => {
    const suggested = normalizeFlowFieldName(nextLabel)
    onUpdate(index, {
      label: nextLabel,
      name: field.name ? field.name : suggested,
    })
  }

  const handleAddOption = () => {
    const next = [...(field.options || [])]
    const n = next.length + 1
    next.push({ id: `opcao_${n}`, title: `Opção ${n}` })
    onUpdate(index, { options: next })
  }

  const handleUpdateOptionId = (optIndex: number, newId: string) => {
    const next = [...(field.options || [])]
    next[optIndex] = { ...next[optIndex], id: normalizeFlowFieldName(newId) || next[optIndex].id }
    onUpdate(index, { options: next })
  }

  const handleUpdateOptionTitle = (optIndex: number, newTitle: string) => {
    const next = [...(field.options || [])]
    next[optIndex] = { ...next[optIndex], title: newTitle }
    onUpdate(index, { options: next })
  }

  const handleRemoveOption = (optIndex: number) => {
    const next = (field.options || []).filter((_: any, i: number) => i !== optIndex)
    onUpdate(index, { options: next })
  }

  return (
    <div className="py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          {/* Label and Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">
                Pergunta
              </label>
              <Input
                value={field.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="Digite a pergunta"
                ref={questionRef}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">
                Tipo
              </label>
              <Select value={field.type} onValueChange={handleTypeChange}>
                <SelectTrigger className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_TYPE_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Name and Required */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">
                Identificador (name)
              </label>
              <Input
                value={field.name}
                onChange={(e) => onUpdate(index, { name: normalizeFlowFieldName(e.target.value) })}
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Isso vira a chave no response_json.
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-2">
              <div>
                <div className="text-xs font-medium text-slate-300">Obrigatório</div>
                <div className="text-[11px] text-slate-500">O usuário precisa preencher</div>
              </div>
              <Switch
                checked={!!field.required}
                onCheckedChange={(checked) => onUpdate(index, { required: checked })}
                disabled={field.type === 'optin'}
              />
            </div>
          </div>

          {/* Opt-in text */}
          {field.type === 'optin' && (
            <div className="mt-3">
              <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">
                Texto do opt-in
              </label>
              <Textarea
                value={field.text || ''}
                onChange={(e) => onUpdate(index, { text: e.target.value })}
                className="min-h-18"
              />
            </div>
          )}

          {/* Options for choice fields */}
          {showOptions && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs uppercase tracking-widest text-slate-500">
                  Opções
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] text-slate-200 hover:text-white hover:bg-[var(--ds-bg-hover)]"
                  onClick={handleAddOption}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar opção
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {(field.options || []).map((opt: FlowFormOption, oidx: number) => (
                  <div
                    key={`${field.id}_${oidx}`}
                    className="grid grid-cols-1 md:grid-cols-[140px_1fr_auto] gap-2 items-center"
                  >
                    <Input
                      value={opt.id}
                      onChange={(e) => handleUpdateOptionId(oidx, e.target.value)}
                      className="font-mono text-xs"
                      placeholder="id"
                    />
                    <Input
                      value={opt.title}
                      onChange={(e) => handleUpdateOptionTitle(oidx, e.target.value)}
                      placeholder="Título"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                      onClick={() => handleRemoveOption(oidx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
            disabled={index === 0}
            onClick={() => onMove(index, 'up')}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
            disabled={index === totalFields - 1}
            onClick={() => onMove(index, 'down')}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
            onClick={() => onDuplicate(index)}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-500/20 bg-slate-900 hover:bg-red-500/10"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
