'use client'

import React from 'react'
import { Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { FormMetadataProps } from './types'

export function FormMetadata({
  form,
  showIntro,
  showTechFields,
  dirty,
  issues,
  canSave,
  onUpdate,
  onSave,
}: FormMetadataProps) {
  return (
    <>
      <div className="space-y-4">
        {showIntro && (
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">
              Boas-vindas
            </label>
            <Textarea
              value={form.intro || ''}
              onChange={(e) => onUpdate({ intro: e.target.value })}
              className="min-h-20"
              placeholder="Ex: Preencha os dados abaixo."
            />
          </div>
        )}

        {showTechFields && (
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">
              Screen ID (Meta)
            </label>
            <Input
              value={form.screenId}
              onChange={(e) => onUpdate({ screenId: e.target.value.toUpperCase() })}
            />
            <div className="text-[11px] text-slate-500 mt-1">Ex: CADASTRO, NPS, AGENDAMENTO</div>
          </div>
        )}
      </div>

      {showTechFields && (
        <div className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-4">
          <div className="text-sm font-semibold text-white">Status</div>
          <div className="mt-2 text-sm text-slate-400">
            {dirty ? 'Alterações não salvas' : 'Sincronizado'}
            {issues.length === 0 ? (
              <span className="text-primary-300"> • pronto</span>
            ) : (
              <span className="text-amber-300"> • revisar</span>
            )}
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            Este modo cria o JSON no padrão usado pelos templates internos (sem endpoint).
          </div>

          <Button
            type="button"
            className="mt-3 w-full bg-white text-black hover:bg-slate-200"
            disabled={!canSave}
            onClick={onSave}
          >
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>
      )}
    </>
  )
}
