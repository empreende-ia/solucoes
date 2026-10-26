'use client'

import type { LeadFormField } from '@/types'
import { Button } from '@/components/ui/button'
import { FormFieldEditor } from './FormFieldEditor'

export interface FormFieldsSectionProps {
  fields: LeadFormField[]
  collectEmail: boolean
  disabled?: boolean
  onAddField: () => void
  onUpdateField: (index: number, patch: Partial<LeadFormField>) => void
  onRemoveField: (index: number) => void
  onMoveFieldUp: (index: number) => void
  onMoveFieldDown: (index: number) => void
}

export function FormFieldsSection({
  fields,
  collectEmail,
  disabled = false,
  onAddField,
  onUpdateField,
  onRemoveField,
  onMoveFieldUp,
  onMoveFieldDown,
}: FormFieldsSectionProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[var(--ds-bg-elevated)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Campos do formulario</p>
          <p className="text-xs text-slate-500">
            Estes campos abaixo sempre aparecem no formulario publico. Voce pode adicionar campos extras (ex: curso, turma, cidade).
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="border-slate-700 bg-slate-900"
          onClick={onAddField}
          disabled={disabled}
        >
          Adicionar campo
        </Button>
      </div>

      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/30 p-3">
        <p className="text-xs font-medium text-slate-300">Campos padrão (fixos)</p>
        <ul className="mt-2 space-y-1 text-xs text-slate-400">
          <li>
            <span className="text-slate-200">Nome</span> <span className="text-slate-500">- obrigatório</span>
          </li>
          <li>
            <span className="text-slate-200">Telefone (WhatsApp)</span> <span className="text-slate-500">- obrigatório</span>
          </li>
          <li>
            <span className="text-slate-200">Email</span>{' '}
            <span className="text-slate-500">- {collectEmail ? 'opcional' : 'oculto'}</span>
          </li>
        </ul>
      </div>

      {fields.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Nenhum campo extra por enquanto.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {fields.map((f, idx) => (
            <FormFieldEditor
              key={`${f.key}-${idx}`}
              field={f}
              index={idx}
              isFirst={idx === 0}
              isLast={idx === fields.length - 1}
              disabled={disabled}
              onUpdate={onUpdateField}
              onRemove={onRemoveField}
              onMoveUp={onMoveFieldUp}
              onMoveDown={onMoveFieldDown}
            />
          ))}
        </div>
      )}
    </div>
  )
}
