'use client'

import type { CreateLeadFormDTO, LeadFormField } from '@/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { LeadFormPreview } from './LeadFormPreview'
import { FormFieldsSection } from './FormFieldsSection'
import { slugify, normalizeFieldOrder, moveItem, createDefaultField } from './utils'

export interface EditFormDialogProps {
  isOpen: boolean
  onClose: () => void
  draft: CreateLeadFormDTO
  setDraft: (dto: CreateLeadFormDTO) => void
  onSave: () => void
  isUpdating: boolean
  updateError?: string
  publicBaseUrl: string
  sortedTags: string[]
}

export function EditFormDialog({
  isOpen,
  onClose,
  draft,
  setDraft,
  onSave,
  isUpdating,
  updateError,
  publicBaseUrl,
  sortedTags,
}: EditFormDialogProps) {
  const fields = draft.fields || []

  const addField = () => {
    const next = createDefaultField(fields.length)
    setDraft({ ...draft, fields: normalizeFieldOrder([...fields, next]) })
  }

  const updateField = (index: number, patch: Partial<LeadFormField>) => {
    const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f))
    setDraft({ ...draft, fields: next })
  }

  const removeField = (index: number) => {
    const next = normalizeFieldOrder(fields.filter((_, i) => i !== index))
    setDraft({ ...draft, fields: next })
  }

  const moveFieldUp = (index: number) => {
    const next = normalizeFieldOrder(moveItem(fields, index, index - 1))
    setDraft({ ...draft, fields: next })
  }

  const moveFieldDown = (index: number) => {
    const next = normalizeFieldOrder(moveItem(fields, index, index + 1))
    setDraft({ ...draft, fields: next })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="border-slate-800 bg-slate-950 text-slate-100 sm:max-w-275 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar formulario</DialogTitle>
          <DialogDescription className="text-slate-400">
            Voce pode alterar nome, slug, tag, campos e mensagem de sucesso. Atencao: mudar o slug altera o link publico.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex: Lista de espera - Turma Janeiro"
                className="bg-slate-900 border-slate-800"
                disabled={isUpdating}
              />
            </div>

            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })}
                placeholder="ex: lista-espera-janeiro"
                className="bg-slate-900 border-slate-800"
                disabled={isUpdating}
              />
              <p className="text-xs text-slate-500">
                Link publico:{' '}
                <span className="text-slate-300">
                  {(publicBaseUrl || '...').replace(/\/$/, '')}/f/{draft.slug || 'seu-slug'}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tag</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={draft.tag}
                  onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                  placeholder="Ex: alunos-turma-jan"
                  className="bg-slate-900 border-slate-800"
                  disabled={isUpdating}
                />
                <select
                  className="h-10 rounded-md border border-slate-800 bg-slate-900 px-3 text-sm"
                  value={draft.tag || ''}
                  onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                  disabled={isUpdating}
                >
                  <option value="">Selecionar tag existente...</option>
                  {sortedTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-[var(--ds-bg-elevated)] p-3">
              <div>
                <p className="text-sm font-medium">Ativo</p>
                <p className="text-xs text-slate-500">Quando desligado, o link publico retorna 404.</p>
              </div>
              <Switch
                checked={draft.isActive ?? true}
                onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                disabled={isUpdating}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-[var(--ds-bg-elevated)] p-3">
              <div>
                <p className="text-sm font-medium">Coletar email</p>
                <p className="text-xs text-slate-500">Mostra o campo de email no formulario publico.</p>
              </div>
              <Switch
                checked={draft.collectEmail ?? true}
                onCheckedChange={(checked) => setDraft({ ...draft, collectEmail: checked })}
                disabled={isUpdating}
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem de sucesso (opcional)</Label>
              <Textarea
                value={draft.successMessage ?? ''}
                onChange={(e) => setDraft({ ...draft, successMessage: e.target.value })}
                placeholder="Ex: Cadastro confirmado! Em breve voce recebera uma mensagem no WhatsApp."
                className="min-h-22.5 bg-slate-900 border-slate-800"
                disabled={isUpdating}
              />
            </div>

            <FormFieldsSection
              fields={fields}
              collectEmail={draft.collectEmail ?? true}
              disabled={isUpdating}
              onAddField={addField}
              onUpdateField={updateField}
              onRemoveField={removeField}
              onMoveFieldUp={moveFieldUp}
              onMoveFieldDown={moveFieldDown}
            />

            {updateError ? (
              <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
                {updateError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="border-slate-700 bg-slate-900"
                onClick={onClose}
                disabled={isUpdating}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={onSave} disabled={isUpdating}>
                {isUpdating ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>

          <div className="lg:sticky lg:top-2">
            <LeadFormPreview
              title={draft.name}
              collectEmail={draft.collectEmail ?? true}
              fields={fields}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
