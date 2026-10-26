'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { flowJsonToFormSpec } from '@/lib/flow-form'
import { FLOW_TEMPLATES } from '@/lib/flow-templates'
import { TemplateImportDialogProps } from './types'

export function TemplateImportDialog({
  open,
  onOpenChange,
  flowName,
  onImported,
  onActionComplete,
}: TemplateImportDialogProps) {
  const [selectedKey, setSelectedKey] = useState<string>('')

  // Set default template when opening
  useEffect(() => {
    if (open && !selectedKey && FLOW_TEMPLATES.length > 0) {
      setSelectedKey(FLOW_TEMPLATES[0].key)
    }
  }, [open, selectedKey])

  const handleImport = () => {
    const tpl = FLOW_TEMPLATES.find((t) => t.key === selectedKey)
    if (!tpl) return

    // Se o template tem form spec pré-definido, usa ele; senão converte do flowJson
    const nextForm = tpl.form
      ? { ...tpl.form, title: flowName || tpl.form.title }
      : flowJsonToFormSpec(tpl.flowJson, flowName || 'MiniApp')

    // Passa resultado completo incluindo flowJson dinâmico se aplicável
    onImported({
      form: nextForm,
      dynamicFlowJson: tpl.isDynamic ? tpl.flowJson : undefined,
      templateKey: tpl.key,
    })
    onOpenChange(false)

    if (tpl.isDynamic) {
      toast.success('Template dinâmico importado! O agendamento em tempo real será configurado ao publicar.')
    } else {
      toast.success('Modelo importado. Revise e salve quando estiver pronto.')
    }
    onActionComplete?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-[var(--ds-border-subtle)] text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar modelo pronto</DialogTitle>
          <DialogDescription className="text-slate-400">
            Isso substitui o formulário atual. Você pode editar depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
          {FLOW_TEMPLATES.map((tpl) => (
            <label
              key={tpl.key}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ${
                selectedKey === tpl.key
                  ? tpl.isDynamic
                    ? 'border-primary-400/40 bg-primary-500/10'
                    : 'border-primary-400/40 bg-primary-500/10'
                  : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]'
              }`}
            >
              <input
                type="radio"
                name="flow_template"
                className={`mt-1 h-4 w-4 ${tpl.isDynamic ? 'accent-primary-400' : 'accent-primary-400'}`}
                checked={selectedKey === tpl.key}
                onChange={() => setSelectedKey(tpl.key)}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{tpl.name}</span>
                  <span
                    className={
                      'px-1.5 py-0.5 text-[10px] rounded ' +
                      (tpl.isDynamic ? 'bg-primary-500/20 text-primary-300' : 'bg-[var(--ds-bg-hover)] text-slate-300')
                    }
                  >
                    {tpl.isDynamic ? 'Dinâmico' : 'Simples'}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{tpl.description}</div>
              </div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="border-[var(--ds-border-subtle)] bg-slate-900 hover:bg-[var(--ds-bg-hover)]"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={!selectedKey} onClick={handleImport}>
            Usar modelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
