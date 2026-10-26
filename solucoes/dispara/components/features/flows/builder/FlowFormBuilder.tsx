'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { MoreVertical, Plus, Trash2 } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import {
  FlowFormFieldType,
  FlowFormSpecV1,
  FlowFormStepV1,
  generateFlowJsonFromFormSpec,
  normalizeFlowFieldName,
  normalizeFlowFormSpec,
  validateFlowFormSpec,
} from '@/lib/flow-form'
import { FLOW_TEMPLATES } from '@/lib/flow-templates'

import {
  FormHeader,
  FormMetadata,
  FieldList,
  IssuesAlert,
  AIGenerateDialog,
  TemplateImportDialog,
  FlowFormBuilderProps,
  TemplateImportResult,
  createNewField,
  moveItem,
} from './form-builder'

export function FlowFormBuilder(props: FlowFormBuilderProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const initialForm = useMemo(() => {
    const s = (props.currentSpec as any) || {}
    return normalizeFlowFormSpec(s?.form, props.flowName)
  }, [props.currentSpec, props.flowName])

  const [form, setForm] = useState<FlowFormSpecV1>(initialForm)
  const [dirty, setDirty] = useState(false)
  // Guarda o flowJson dinâmico se um template dinâmico foi importado
  const [dynamicFlowJson, setDynamicFlowJson] = useState<Record<string, unknown> | null>(null)

  const [aiOpen, setAiOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const [activeStepId, setActiveStepId] = useState<string>('STEP_1')

  const showHeaderActions = props.showHeaderActions !== false
  const showTechFields = props.showTechFields !== false
  const questionRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // Register external actions
  useEffect(() => {
    if (!props.registerActions) return
    props.registerActions({
      openAI: () => setAiOpen(true),
      openTemplate: () => setTemplateOpen(true),
      setScreenId: (value: string) => update({ screenId: value }),
    })
  }, [props])

  // Reset form when initialForm changes (only if not dirty)
  useEffect(() => {
    if (dirty) return
    setForm(initialForm)
    setActiveStepId(initialForm.steps?.[0]?.id || 'STEP_1')
  }, [dirty, initialForm])

  // Sync form title with flowName
  useEffect(() => {
    if (!props.flowName) return
    setForm((prev) => {
      if (prev.title === props.flowName) return prev
      return { ...prev, title: props.flowName }
    })
  }, [props.flowName])

  // Auto-focus newly added fields
  useEffect(() => {
    if (!lastAddedId) return
    const target = questionRefs.current[lastAddedId]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus()
    }
    setLastAddedId(null)
  }, [lastAddedId])

  // Show intro if form has intro content
  useEffect(() => {
    if (!form.intro) return
    setShowIntro(true)
  }, [form.intro])

  // Computed values
  const steps: FlowFormStepV1[] = useMemo(() => {
    if (Array.isArray(form.steps) && form.steps.length > 0) return form.steps
    return [{ id: 'STEP_1', fields: form.fields }]
  }, [form.fields, form.steps])

  const activeStepIndex = useMemo(() => {
    const idx = steps.findIndex((s) => s.id === activeStepId)
    return idx >= 0 ? idx : 0
  }, [activeStepId, steps])

  const activeStep = steps[activeStepIndex] || steps[0] || { id: 'STEP_1', fields: [] }
  const activeFields = activeStep.fields || []
  const isLastStep = activeStepIndex === steps.length - 1

  // Ensure active step exists
  useEffect(() => {
    if (!steps.length) return
    if (steps.some((s) => s.id === activeStepId)) return
    setActiveStepId(steps[0]?.id || 'STEP_1')
  }, [activeStepId, steps])

  const issues = useMemo(() => validateFlowFormSpec(form), [form])
  const generatedJson = useMemo(() => generateFlowJsonFromFormSpec(form), [form])

  useEffect(() => {
    const screens = Array.isArray((generatedJson as any)?.screens) ? ((generatedJson as any).screens as any[]) : []
    const targetScreenId = screens[activeStepIndex]?.id || null
    if (props.onPreviewScreenIdChange) {
      props.onPreviewScreenIdChange(targetScreenId)
    }
  }, [activeStepId, activeStepIndex, generatedJson, steps.length])

  // Notify parent of preview changes
  useEffect(() => {
    props.onPreviewChange?.({
      form,
      generatedJson,
      issues,
      dirty,
    })
  }, [dirty, form, generatedJson, issues, props.onPreviewChange])

  const canSave = issues.length === 0 && dirty && !props.isSaving

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const update = (patch: Partial<FlowFormSpecV1>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const setActiveStepFields = (nextFields: any[]) => {
    setForm((prev) => {
      if (Array.isArray(prev.steps) && prev.steps.length > 0) {
        const nextSteps = prev.steps.map((s) => (s.id === activeStepId ? { ...s, fields: nextFields } : s))
        const flattened = nextSteps.flatMap((s) => s.fields)
        return { ...prev, steps: nextSteps, fields: flattened }
      }
      return { ...prev, fields: nextFields }
    })
    setDirty(true)
  }

  const updateActiveStep = (patch: Partial<FlowFormStepV1>) => {
    setForm((prev) => {
      const currentSteps =
        Array.isArray(prev.steps) && prev.steps.length > 0 ? prev.steps : [{ id: 'STEP_1', fields: prev.fields }]
      const nextSteps = currentSteps.map((s) => (s.id === activeStepId ? { ...s, ...patch } : s))
      const flattened = nextSteps.flatMap((s) => s.fields)
      const first = nextSteps[0] as any
      const hasStepMeta =
        !!String(first?.title || '').trim() ||
        !!String(first?.nextLabel || '').trim()
      const shouldKeepSteps = nextSteps.length > 1 || hasStepMeta
      return { ...prev, steps: shouldKeepSteps ? nextSteps : undefined, fields: flattened }
    })
    setDirty(true)
  }

  const updateField = (idx: number, patch: any) => {
    const next = [...activeFields]
    next[idx] = { ...next[idx], ...patch }
    setActiveStepFields(next)
  }

  const addField = (type: FlowFormFieldType) => {
    const nextField = createNewField(type)
    setActiveStepFields([...activeFields, nextField])
    setLastAddedId(nextField.id)
  }

  const moveField = (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? Math.max(0, idx - 1) : Math.min(activeFields.length - 1, idx + 1)
    setActiveStepFields(moveItem(activeFields, idx, newIdx))
  }

  const duplicateField = (idx: number) => {
    const f = activeFields[idx]
    const copy = {
      ...f,
      id: `q_${nanoid(8)}`,
      name: normalizeFlowFieldName(`${f.name}_copy_${nanoid(3)}`) || `campo_${nanoid(4)}`,
    }
    const next = [...activeFields]
    next.splice(idx + 1, 0, copy)
    setActiveStepFields(next)
  }

  const removeField = (idx: number) => {
    setActiveStepFields(activeFields.filter((_, i) => i !== idx))
  }

  const addStep = () => {
    setForm((prev) => {
      const currentSteps =
        Array.isArray(prev.steps) && prev.steps.length > 0 ? prev.steps : [{ id: 'STEP_1', fields: prev.fields }]
      const nextId = `STEP_${currentSteps.length + 1}`
      const nextSteps = [...currentSteps, { id: nextId, title: `Etapa ${currentSteps.length + 1}`, nextLabel: 'Continuar', fields: [] }]
      const flattened = nextSteps.flatMap((s) => s.fields)
      setActiveStepId(nextId)
      return { ...prev, steps: nextSteps, fields: flattened }
    })
    setDirty(true)
  }

  const removeActiveStep = () => {
    setForm((prev) => {
      const currentSteps =
        Array.isArray(prev.steps) && prev.steps.length > 0 ? prev.steps : [{ id: 'STEP_1', fields: prev.fields }]
      if (currentSteps.length <= 1) return prev
      const nextSteps = currentSteps.filter((s) => s.id !== activeStepId)
      const flattened = nextSteps.flatMap((s) => s.fields)
      const nextActive = nextSteps[Math.max(0, Math.min(activeStepIndex, nextSteps.length - 1))]?.id || nextSteps[0]?.id || 'STEP_1'
      setActiveStepId(nextActive)
      return { ...prev, steps: nextSteps.length > 1 ? nextSteps : undefined, fields: flattened }
    })
    setDirty(true)
  }

  const save = () => {
    const baseSpec = props.currentSpec && typeof props.currentSpec === 'object' ? (props.currentSpec as any) : {}
    const normalizedTitle = (props.flowName || form.title || 'MiniApp').trim() || 'MiniApp'
    const nextStepsRaw = Array.isArray(form.steps) && form.steps.length > 0 ? form.steps : undefined
    const first = (nextStepsRaw?.[0] as any) || null
    const keepSingleStepMeta =
      !!String(first?.title || '').trim() ||
      !!String(first?.nextLabel || '').trim()
    const nextSteps =
      nextStepsRaw && (nextStepsRaw.length > 1 || keepSingleStepMeta) ? nextStepsRaw : undefined
    const flattenedFields = nextSteps ? nextSteps.flatMap((s) => s.fields) : form.fields
    const nextForm = { ...form, title: normalizedTitle, steps: nextSteps, fields: flattenedFields }
    const nextSpec = { ...baseSpec, form: nextForm }

    // Se temos um flowJson dinâmico (de template dinâmico), usa ele em vez de gerar do form
    const finalFlowJson = dynamicFlowJson || generateFlowJsonFromFormSpec(nextForm)

    props.onSave({
      spec: nextSpec,
      flowJson: finalFlowJson,
    })
    setDirty(false)
  }

  const handleAIGenerated = (generatedForm: FlowFormSpecV1) => {
    setForm((prev) => ({ ...generatedForm, screenId: prev.screenId || generatedForm.screenId }))
    setDirty(true)
  }

  const handleTemplateImported = (result: TemplateImportResult) => {
    setForm(result.form)
    // Se é template dinâmico, guarda o flowJson para usar ao salvar
    setDynamicFlowJson(result.dynamicFlowJson || null)
    setDirty(true)
  }

  const handleOpenTemplate = () => {
    setTemplateOpen(true)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header with AI and Template buttons */}
      <FormHeader
        showHeaderActions={showHeaderActions}
        onOpenAI={() => setAiOpen(true)}
        onOpenTemplate={handleOpenTemplate}
      />

      {/* Form metadata (intro, screenId, status) */}
      <FormMetadata
        form={form}
        showIntro={showIntro && activeStepIndex === 0}
        showTechFields={showTechFields}
        dirty={dirty}
        issues={issues}
        canSave={canSave}
        onUpdate={update}
        onSave={save}
      />

      {/* Steps (multi-screen form) */}
      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Etapas</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] px-2"
                aria-label="Ações das etapas"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-[var(--ds-border-subtle)] text-white min-w-56">
              <DropdownMenuItem onClick={addStep}>
                <Plus className="h-4 w-4" />
                Adicionar etapa
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={steps.length <= 1} onClick={removeActiveStep}>
                <Trash2 className="h-4 w-4" />
                Remover etapa
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
              <DropdownMenuItem disabled={!canSave} onClick={save}>
                Salvar agora
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tabs value={activeStepId} onValueChange={setActiveStepId}>
          <TabsList className="bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)]">
            {steps.map((s, idx) => (
              <TabsTrigger key={s.id} value={s.id} className="text-xs">
                {(s.title || `Etapa ${idx + 1}`).slice(0, 18)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Título da etapa</label>
            <Input
              value={activeStep?.title || ''}
              onChange={(e) => {
                updateActiveStep({ title: e.target.value })
              }}
              placeholder={form.title || `Etapa ${activeStepIndex + 1}`}
            />
            <div className="text-[11px] text-slate-500 mt-1">Se vazio, usa o título do formulário.</div>
          </div>
          {!isLastStep ? (
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Botão desta etapa</label>
              <Input
                value={activeStep?.nextLabel || 'Continuar'}
                onChange={(e) => updateActiveStep({ nextLabel: e.target.value })}
                placeholder="Continuar"
              />
              <div className="text-[11px] text-slate-500 mt-1">Leva para a próxima etapa automaticamente.</div>
            </div>
          ) : (
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Botão (final)</label>
              <Input value={form.submitLabel} onChange={(e) => update({ submitLabel: e.target.value })} />
              <div className="text-[11px] text-slate-500 mt-1">Finaliza e envia o payload para o webhook.</div>
            </div>
          )}
        </div>
      </div>

      {/* Field list with issues alert */}
      <div>
        <FieldList
          fields={activeFields}
          questionRefs={questionRefs}
          onUpdateField={updateField}
          onMoveField={moveField}
          onDuplicateField={duplicateField}
          onRemoveField={removeField}
          onAddField={addField}
        />
        <IssuesAlert issues={issues} />
      </div>

      {isLastStep ? (
        <>
          <div className="flex items-center justify-between rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-2">
            <div>
              <div className="text-xs font-medium text-slate-300">Enviar confirmação ao usuário</div>
              <div className="text-[11px] text-slate-500">Mostra o resumo das respostas após finalizar</div>
            </div>
            <Switch checked={form.sendConfirmation !== false} onCheckedChange={(checked) => update({ sendConfirmation: checked })} />
          </div>

          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-widest text-slate-500">Texto da confirmação (opcional)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                value={form.confirmationTitle || ''}
                onChange={(e) => update({ confirmationTitle: e.target.value })}
                placeholder="Resposta registrada ✅"
              />
              <Input
                value={form.confirmationFooter || ''}
                onChange={(e) => update({ confirmationFooter: e.target.value })}
                placeholder="Qualquer ajuste, responda esta mensagem."
              />
            </div>
          </div>
        </>
      ) : null}

      {/* Dialogs */}
      <AIGenerateDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        flowName={props.flowName}
        onGenerated={handleAIGenerated}
        onActionComplete={props.onActionComplete}
      />

      <TemplateImportDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        flowName={props.flowName}
        onImported={handleTemplateImported}
        onActionComplete={props.onActionComplete}
      />
    </div>
  )
}
