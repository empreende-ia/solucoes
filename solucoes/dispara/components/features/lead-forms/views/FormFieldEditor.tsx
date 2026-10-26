'use client'

import type { LeadFormField } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Container } from '@/components/ui/container'
import { ArrowDown, ArrowUp } from 'lucide-react'

export interface FormFieldEditorProps {
  field: LeadFormField
  index: number
  isFirst: boolean
  isLast: boolean
  disabled?: boolean
  onUpdate: (index: number, patch: Partial<LeadFormField>) => void
  onRemove: (index: number) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
}

export function FormFieldEditor({
  field,
  index,
  isFirst,
  isLast,
  disabled = false,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FormFieldEditorProps) {
  return (
    <Container variant="subtle" padding="sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">Ordem do campo</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-8 border-slate-700 bg-slate-900 px-2"
            onClick={() => onMoveUp(index)}
            disabled={disabled || isFirst}
            title="Mover para cima"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-8 border-slate-700 bg-slate-900 px-2"
            onClick={() => onMoveDown(index)}
            disabled={disabled || isLast}
            title="Mover para baixo"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Label</Label>
          <Input
            value={field.label}
            onChange={(e) => onUpdate(index, { label: e.target.value })}
            className="bg-slate-900 border-slate-800"
            placeholder="Ex: Qual sua turma?"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <Label>Key (salvo em custom_fields)</Label>
          <Input
            value={field.key}
            onChange={(e) => onUpdate(index, { key: e.target.value })}
            className="bg-slate-900 border-slate-800"
            placeholder="Ex: turma"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <Label>Tipo</Label>
          <select
            className="h-10 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm"
            value={field.type}
            onChange={(e) => onUpdate(index, { type: e.target.value as LeadFormField['type'] })}
            disabled={disabled}
          >
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="date">Data</option>
            <option value="select">Lista (select)</option>
          </select>
        </div>

        <div className="flex items-center justify-between rounded-md border border-slate-800 bg-[var(--ds-bg-elevated)] px-3">
          <div>
            <p className="text-sm">Obrigatorio</p>
            <p className="text-xs text-slate-500">Exige preenchimento</p>
          </div>
          <Switch
            checked={!!field.required}
            onCheckedChange={(checked) => onUpdate(index, { required: checked })}
            disabled={disabled}
          />
        </div>
      </div>

      {field.type === 'select' ? (
        <div className="mt-3 space-y-1">
          <Label>Opções (uma por linha)</Label>
          <Textarea
            value={(field.options || []).join('\n')}
            onChange={(e) =>
              onUpdate(index, {
                options: e.target.value
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
            className="min-h-22.5 bg-slate-900 border-slate-800"
            placeholder="Ex:\nTurma A\nTurma B\nTurma C"
            disabled={disabled}
          />
        </div>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button type="button" variant="destructive" onClick={() => onRemove(index)} disabled={disabled}>
          Remover campo
        </Button>
      </div>
    </Container>
  )
}
