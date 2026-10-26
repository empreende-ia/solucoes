'use client'

import React from 'react'
import { ChevronDown, ListPlus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { FlowFormFieldType } from '@/lib/flow-form'
import { FIELD_TYPE_LABEL, FieldListProps } from './types'
import { FieldEditor } from './FieldEditor'

export function FieldList({
  fields,
  questionRefs,
  onUpdateField,
  onMoveField,
  onDuplicateField,
  onRemoveField,
  onAddField,
}: FieldListProps) {
  return (
    <div className="border-t border-[var(--ds-border-subtle)] pt-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <ListPlus className="h-4 w-4" />
          Perguntas
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" className="bg-white text-black hover:bg-slate-200">
              <Plus className="h-4 w-4" />
              Adicionar pergunta
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-slate-900 border-[var(--ds-border-subtle)] text-white min-w-56"
          >
            {Object.entries(FIELD_TYPE_LABEL).map(([key, label]) => (
              <DropdownMenuItem key={key} onClick={() => onAddField(key as FlowFormFieldType)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {fields.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-6 py-8 text-center text-slate-400">
          <div className="text-sm text-slate-300">
            Crie a primeira pergunta para começar sua MiniApp.
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/10 mt-4">
          {fields.map((field, idx) => (
            <FieldEditor
              key={field.id}
              field={field}
              index={idx}
              totalFields={fields.length}
              questionRef={(el) => {
                questionRefs.current[field.id] = el
              }}
              onUpdate={onUpdateField}
              onMove={onMoveField}
              onDuplicate={onDuplicateField}
              onRemove={onRemoveField}
            />
          ))}
        </div>
      )}
    </div>
  )
}
