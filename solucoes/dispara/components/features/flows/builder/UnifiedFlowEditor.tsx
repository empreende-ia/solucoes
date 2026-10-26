'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { ChevronDown, MoreVertical, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { InspectorPanel } from '@/components/features/flows/builder/InspectorPanel'

import { normalizeFlowFieldName } from '@/lib/flow-form'
import {
  bookingConfigToDynamicSpec,
  dynamicFlowSpecFromJson,
  formSpecToDynamicSpec,
  generateDynamicFlowJson,
  normalizeDynamicFlowSpec,
  validateDynamicFlowSpec,
} from '@/lib/dynamic-flow'
import type { DynamicFlowActionType, DynamicFlowBranchRuleV1, DynamicFlowSpecV1 } from '@/lib/dynamic-flow'
import { flowJsonToFormSpec } from '@/lib/flow-form'

type UiBranchRule = DynamicFlowBranchRuleV1 & { __auto_next?: boolean }

type BlockType =
  | 'text_heading'
  | 'text_subheading'
  | 'text_body'
  | 'text_caption'
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'single_choice'
  | 'multi_choice'
  | 'optin'

const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  text_heading: 'Título',
  text_subheading: 'Subtítulo',
  text_body: 'Texto',
  text_caption: 'Legenda',
  short_text: 'Campo: texto',
  long_text: 'Campo: texto longo',
  email: 'Campo: e-mail',
  phone: 'Campo: telefone',
  number: 'Campo: número',
  date: 'Campo: data',
  dropdown: 'Lista (dropdown)',
  single_choice: 'Escolha única',
  multi_choice: 'Múltipla escolha',
  optin: 'Opt-in (checkbox)',
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function defaultOptions() {
  return [
    { id: 'opcao_1', title: 'Opção 1' },
    { id: 'opcao_2', title: 'Opção 2' },
  ]
}

function createSlug(base: string) {
  const slug = normalizeFlowFieldName(base) || 'campo'
  const suffix = nanoid(4).toLowerCase()
  return normalizeFlowFieldName(`${slug}_${suffix}`) || `${slug}_${suffix}`
}

function createNewBlock(type: BlockType): Record<string, unknown> {
  if (type === 'text_heading') return { type: 'TextHeading', text: 'Novo título' }
  if (type === 'text_subheading') return { type: 'TextSubheading', text: 'Novo subtítulo' }
  if (type === 'text_caption') return { type: 'TextCaption', text: 'Legenda' }
  if (type === 'text_body') return { type: 'TextBody', text: 'Novo texto' }

  if (type === 'optin') {
    return { type: 'OptIn', name: createSlug('optin'), text: 'Quero receber mensagens sobre novidades e promoções.' }
  }

  if (type === 'dropdown' || type === 'single_choice' || type === 'multi_choice') {
    const componentType = type === 'dropdown' ? 'Dropdown' : type === 'single_choice' ? 'RadioButtonsGroup' : 'CheckboxGroup'
    return {
      type: componentType,
      name: createSlug('opcao'),
      label: 'Escolha uma opção',
      required: false,
      'data-source': defaultOptions(),
    }
  }

  if (type === 'date') {
    return {
      type: 'CalendarPicker',
      name: createSlug('data'),
      label: 'Data',
      required: true,
      mode: 'single',
    }
  }

  if (type === 'long_text') {
    return { type: 'TextArea', name: createSlug('texto'), label: 'Digite aqui', required: false }
  }

  const inputType = type === 'email' ? 'email' : type === 'phone' ? 'phone' : type === 'number' ? 'number' : 'text'
  return {
    type: 'TextInput',
    name: createSlug('campo'),
    label: 'Novo campo',
    required: type === 'short_text',
    'input-type': inputType,
  }
}

function getFirstForm(screen: any): { index: number; form: any } | null {
  const comps = Array.isArray(screen?.components) ? screen.components : []
  const idx = comps.findIndex((c: any) => c && typeof c === 'object' && c.type === 'Form' && Array.isArray(c.children))
  if (idx < 0) return null
  return { index: idx, form: comps[idx] }
}

function getBlocksForScreen(screen: any): any[] {
  const found = getFirstForm(screen)
  if (found) {
    const blocks = Array.isArray(found.form.children) ? found.form.children : []
    return blocks.filter((b: any) => b?.type !== 'Footer')
  }
  const comps = Array.isArray(screen?.components) ? screen.components : []
  return comps.filter((b: any) => b?.type !== 'Footer')
}

function setBlocksForScreen(screen: any, nextBlocks: any[]): any {
  const comps = Array.isArray(screen?.components) ? screen.components : []
  const found = getFirstForm(screen)
  if (found) {
    const next = [...comps]
    next[found.index] = { ...found.form, children: nextBlocks }
    return { ...screen, components: next }
  }
  return {
    ...screen,
    components: [
      {
        type: 'Form',
        name: 'form',
        children: nextBlocks,
      },
    ],
  }
}

function resolveDataBindingText(raw: unknown, screen: any): string {
  const text = typeof raw === 'string' ? raw : ''
  const match = text.match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
  const key = match?.[1]
  if (!key || !screen?.data || typeof screen.data !== 'object') return text
  const entry = (screen.data as any)[key]
  if (entry && typeof entry === 'object' && '__example__' in entry) {
    const value = (entry as any).__example__
    return value != null ? String(value) : text
  }
  return text
}

function resolveDataBindingList(raw: unknown, screen: any): any[] | null {
  if (!screen?.data || typeof screen.data !== 'object') return null
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return null
  const match = raw.match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
  const key = match?.[1]
  if (!key) return null
  const entry = (screen.data as any)[key]
  if (!entry || typeof entry !== 'object') return null
  const example = (entry as any).__example__
  return Array.isArray(example) ? example : null
}

function getDataBindingKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const match = raw.match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
  return match?.[1] || null
}

function guessActionType(screen: any): DynamicFlowActionType {
  const t = String(screen?.action?.type || '').trim()
  if (t === 'data_exchange' || t === 'navigate' || t === 'complete') return t
  if (screen?.terminal) return 'complete'
  return 'navigate'
}

function guessCtaLabel(screen: any): string {
  const raw = String(screen?.action?.label || '')
  const hasValue = raw.trim().length > 0
  if (hasValue) return raw
  return screen?.terminal ? 'Concluir' : 'Continuar'
}

export function UnifiedFlowEditor(props: {
  flowName: string
  currentSpec: unknown
  flowJsonFromDb?: unknown
  isSaving: boolean
  selectedEditorKey?: string | null
  onOpenAdvanced?: () => void
  onSave: (patch: { spec: unknown; flowJson: unknown }) => void
  onPreviewChange?: (payload: {
    spec: DynamicFlowSpecV1
    generatedJson: unknown
    issues: string[]
    dirty: boolean
    activeScreenId: string
  }) => void
  onPreviewScreenIdChange?: (screenId: string | null) => void
}) {
  const migratedRef = useRef(false)

  const applyAutoFinalizeDestinations = (input: DynamicFlowSpecV1): DynamicFlowSpecV1 => {
    const branchesByScreen = (input as any)?.branchesByScreen || {}
    const allRules = Object.values(branchesByScreen).flatMap((v: any) => (Array.isArray(v) ? v : []))
    const destIds = Array.from(
      new Set(
        allRules
          .map((r: any) => (typeof r?.next === 'string' && r.next ? r.next : null))
          .filter(Boolean) as string[],
      ),
    )
    if (!destIds.length) return input

    const screens = [...(input.screens || [])]
    const routingModel: Record<string, string[]> = { ...((input as any).routingModel || {}) }
    const defaultNextByScreen: Record<string, string | null> = { ...((input as any).defaultNextByScreen || {}) }

    let changed = 0
    for (const destId of destIds) {
      const idx = screens.findIndex((s) => s.id === destId)
      if (idx < 0) continue

      const hasOwnBranches = Array.isArray(branchesByScreen?.[destId]) && branchesByScreen[destId].length > 0
      if (hasOwnBranches) continue

      const s: any = screens[idx]
      const actionType = String(s?.action?.type || '').toLowerCase()
      const alreadyFinal = !!s?.terminal || actionType === 'complete'
      if (alreadyFinal) continue

      screens[idx] = { ...s, terminal: true, action: { type: 'complete', label: 'Concluir' } }
      routingModel[destId] = []
      defaultNextByScreen[destId] = null
      changed++
    }

    if (!changed) return input
    const next = { ...(input as any), screens, routingModel, defaultNextByScreen } as DynamicFlowSpecV1
    return next
  }

  const initialSpec = useMemo(() => {
    const s = (props.currentSpec as any) || {}
    const rawDynamic = s?.dynamicFlow
    if (rawDynamic?.flowJson && typeof rawDynamic.flowJson === 'object') {
      return normalizeDynamicFlowSpec(applyAutoFinalizeDestinations(dynamicFlowSpecFromJson(rawDynamic.flowJson)), props.flowName)
    }
    if (rawDynamic && typeof rawDynamic === 'object') {
      return normalizeDynamicFlowSpec(applyAutoFinalizeDestinations(rawDynamic), props.flowName)
    }
    if (s?.booking && typeof s.booking === 'object') {
      return bookingConfigToDynamicSpec(s.booking)
    }
    if (s?.form && typeof s.form === 'object') {
      return formSpecToDynamicSpec(s.form, props.flowName)
    }
    if (props.flowJsonFromDb && typeof props.flowJsonFromDb === 'object') {
      const flowJson = props.flowJsonFromDb as any
      const hasRoutingModel = !!flowJson?.routing_model
      const hasDataApi = typeof flowJson?.data_api_version === 'string'
      if (hasRoutingModel || hasDataApi) {
        return normalizeDynamicFlowSpec(applyAutoFinalizeDestinations(dynamicFlowSpecFromJson(flowJson)), props.flowName)
      }
      const asForm = flowJsonToFormSpec(flowJson, props.flowName)
      return formSpecToDynamicSpec(asForm, props.flowName)
    }
    return normalizeDynamicFlowSpec({}, props.flowName)
  }, [props.currentSpec, props.flowJsonFromDb, props.flowName])

  const initialFingerprint = useMemo(() => JSON.stringify(initialSpec), [initialSpec])

  const indexToLetters = (index: number): string => {
    // 0 -> A, 25 -> Z, 26 -> AA ...
    let n = Math.max(0, Math.floor(index))
    let out = ''
    do {
      const r = n % 26
      out = String.fromCharCode(65 + r) + out
      n = Math.floor(n / 26) - 1
    } while (n >= 0)
    return out || 'A'
  }

  const makeNextScreenId = (existing: string[]): string => {
    const used = new Set(existing.map((s) => String(s || '').toUpperCase()))
    for (let i = 0; i < 2000; i++) {
      const candidate = `SCREEN_${indexToLetters(i)}`
      if (!used.has(candidate)) return candidate
    }
    return `SCREEN_${indexToLetters(0)}`
  }

  const [spec, setSpec] = useState<DynamicFlowSpecV1>(initialSpec)
  const [dirty, setDirty] = useState(false)
  const [activeScreenId, setActiveScreenId] = useState<string>(initialSpec.screens[0]?.id || 'SCREEN_A')
  // #region agent log
  React.useEffect(() => {
    const successScreen = spec.screens.find((s: any) => s.id === 'SUCCESS' || s.id?.includes('SUCCESS') || (s as any).success === true)
    if (successScreen) {
    }
  }, [spec])
  // #endregion
  const lastAddedRef = useRef<string | null>(null)
  const previewEmitCountRef = useRef(0)

  useEffect(() => {
    if (dirty) return
    setSpec(initialSpec)
    setActiveScreenId((prev) => {
      const next = (initialSpec.screens || []).some((s) => s?.id === prev)
      return next ? prev : (initialSpec.screens[0]?.id || 'SCREEN_A')
    })
    // OBS: dependemos do fingerprint para não “piscar” ao trocar dirty->false no auto-save
  }, [initialFingerprint])

  useEffect(() => {
    props.onPreviewScreenIdChange?.(activeScreenId || null)
  }, [activeScreenId, props])

  useEffect(() => {
    if (!lastAddedRef.current) return
    const el = document.querySelector<HTMLInputElement>(`[data-block-focus="${lastAddedRef.current}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
    }
    lastAddedRef.current = null
  }, [spec])

  const issues = useMemo(() => validateDynamicFlowSpec(spec), [spec])
  const generatedJson = useMemo(() => generateDynamicFlowJson(spec), [spec])
  const canSave = issues.length === 0 && dirty && !props.isSaving
  const saveStatusText = props.isSaving ? 'Salvando…' : dirty ? 'Alterações…' : 'Salvo'
  const onPreviewChange = props.onPreviewChange

  useEffect(() => {
    previewEmitCountRef.current += 1
    // #region agent log
    try {
      const screens = Array.isArray((generatedJson as any)?.screens) ? (generatedJson as any).screens : []
      const firstScreenId = screens.length ? String(screens[0]?.id || '') : null
    } catch {}
    // #endregion agent log
    onPreviewChange?.({ spec, generatedJson, issues, dirty, activeScreenId })
  }, [activeScreenId, dirty, generatedJson, issues, onPreviewChange, spec])

  // Migração “silenciosa”: se não houver spec.dynamicFlow ainda, persistimos o canônico em background.
  useEffect(() => {
    if (dirty) return
    if (migratedRef.current) return
    const s = (props.currentSpec as any) || {}
    const hasCanonical = s?.dynamicFlow && typeof s.dynamicFlow === 'object'
    if (hasCanonical) return
    migratedRef.current = true
    const baseSpec = props.currentSpec && typeof props.currentSpec === 'object' ? (props.currentSpec as any) : {}
    const nextSpec = { ...baseSpec, dynamicFlow: spec }
    props.onSave({ spec: nextSpec, flowJson: generatedJson })
  }, [dirty, generatedJson, props, spec])

  const save = React.useCallback(() => {
    const baseSpec = props.currentSpec && typeof props.currentSpec === 'object' ? (props.currentSpec as any) : {}
    const nextSpec = { ...baseSpec, dynamicFlow: spec }
    props.onSave({ spec: nextSpec, flowJson: generatedJson })
    setDirty(false)
  }, [generatedJson, props.currentSpec, props.onSave, spec])

  useEffect(() => {
    if (!dirty) return
    if (issues.length > 0) return
    if (props.isSaving) return
    const t = setTimeout(() => {
      save()
    }, 900)
    return () => clearTimeout(t)
  }, [dirty, issues.length, props.isSaving, save])

  const updateSpec = (updater: (prev: DynamicFlowSpecV1) => DynamicFlowSpecV1) => {
    setSpec((prev) => {
      const nextDraft = updater(prev)
      try {
        const activeDraft = Array.isArray((nextDraft as any)?.screens)
          ? (nextDraft as any).screens.find((s: any) => s?.id === activeScreenId)
          : null
        const draftLabel = typeof activeDraft?.action?.label === 'string' ? activeDraft.action.label : ''
        const draftTrimmed = draftLabel.trim()
        // #region agent log
        // #endregion
      } catch {}
      // Mantém o spec sempre consistente (routing + defaults + branches).
      const normalized = normalizeDynamicFlowSpec(applyAutoFinalizeDestinations(nextDraft), props.flowName)
      const screens = Array.isArray(normalized?.screens) ? [...normalized.screens] : []
      const routingModel =
        (normalized as any)?.routingModel && typeof (normalized as any).routingModel === 'object' ? (normalized as any).routingModel : {}

      try {
        const active = screens.find((s: any) => s?.id === activeScreenId)
        const actionLabel = active?.action?.label
        const labelStr = typeof actionLabel === 'string' ? actionLabel : ''
        const trimmed = labelStr.trim()
        // #region agent log
        // #endregion
      } catch {}

      try {
        const terminalsWithNext = screens
          .map((s: any) => {
            const nextId = Array.isArray(routingModel?.[s.id]) ? routingModel[s.id][0] : undefined
            return nextId && s?.terminal ? { id: s.id, nextId } : null
          })
          .filter(Boolean)
          .slice(0, 8)
        // #region agent log
        // #endregion agent log
      } catch {}

      // Regra UX: se uma tela tem próxima tela, ela NÃO pode ser “final”.
      for (let i = 0; i < screens.length; i++) {
        const s: any = screens[i]
        const nextId = Array.isArray(routingModel?.[s.id]) ? routingModel[s.id][0] : undefined
        if (nextId && s?.terminal) {
          screens[i] = {
            ...s,
            terminal: false,
            action: {
              ...(s.action || {}),
              type: 'navigate',
              label: 'Continuar',
              screen: nextId,
            },
          }
        }
      }

      try {
        const terminalsWithNextAfter = screens
          .map((s: any) => {
            const nextId = Array.isArray(routingModel?.[s.id]) ? routingModel[s.id][0] : undefined
            return nextId && s?.terminal ? { id: s.id, nextId } : null
          })
          .filter(Boolean)
          .slice(0, 8)
        // #region agent log
        // #endregion agent log
      } catch {}

      return normalizeDynamicFlowSpec({ ...normalized, screens }, props.flowName)
    })
    setDirty(true)
  }

  const activeIndex = useMemo(() => spec.screens.findIndex((s) => s.id === activeScreenId), [activeScreenId, spec.screens])
  const activeScreen = activeIndex >= 0 ? spec.screens[activeIndex] : spec.screens[0]
  const blocks = useMemo(() => getBlocksForScreen(activeScreen), [activeScreen])

  const nextScreenId = useMemo(() => {
    const routes = spec.routingModel?.[activeScreen?.id] || []
    return routes[0] || ''
  }, [activeScreen?.id, spec.routingModel])

  const ctaType = guessActionType(activeScreen)
  const ctaLabel = guessCtaLabel(activeScreen)
  const defaultNextId = useMemo(() => spec.defaultNextByScreen?.[activeScreenId] || '', [activeScreenId, spec.defaultNextByScreen])

  const pathFieldOptions = useMemo(() => {
    const list = (blocks || [])
      .map((b: any) => {
        const name = String(b?.name || '').trim()
        if (!name) return null
        const label = String(b?.label || b?.text || name).trim() || name
        const type = String(b?.type || '').trim()
        return { name, label, type }
      })
      .filter(Boolean) as Array<{ name: string; label: string; type: string }>
    // Dedup por name
    const seen = new Set<string>()
    return list.filter((x) => {
      if (seen.has(x.name)) return false
      seen.add(x.name)
      return true
    })
  }, [blocks])

  const choiceOptionsByField = useMemo(() => {
    const out: Record<string, Array<{ value: string; label: string }>> = {}
    for (const b of blocks || []) {
      const name = String(b?.name || '').trim()
      if (!name) continue
      const type = String(b?.type || '').trim()
      const isChoice = type === 'Dropdown' || type === 'RadioButtonsGroup' || type === 'CheckboxGroup'
      if (!isChoice) continue
      const options = Array.isArray(b?.['data-source']) ? (b['data-source'] as any[]) : Array.isArray(b?.options) ? (b.options as any[]) : []
      const normalized = options
        .map((o) => {
          if (!o || typeof o !== 'object') return null
          const value = String((o as any).id ?? (o as any).title ?? '').trim()
          const label = String((o as any).title ?? (o as any).id ?? '').trim()
          if (!value) return null
          return { value, label: label || value }
        })
        .filter(Boolean) as Array<{ value: string; label: string }>
      if (normalized.length) out[name] = normalized
    }
    return out
  }, [blocks])

  const activeBranches = useMemo(
    () => (Array.isArray(spec.branchesByScreen?.[activeScreenId]) ? (spec.branchesByScreen[activeScreenId] as DynamicFlowBranchRuleV1[]) : []),
    [activeScreenId, spec.branchesByScreen],
  )

  const setDefaultNextForActive = (next: string | null) => {
    updateSpec((prev) => {
      const defaultNextByScreen: Record<string, string | null> = { ...(prev.defaultNextByScreen || {}) }
      defaultNextByScreen[activeScreenId] = next
      const routingModel: Record<string, string[]> = { ...(prev.routingModel || {}) }
      routingModel[activeScreenId] = next ? [next] : []
      return { ...prev, defaultNextByScreen, routingModel }
    })
  }

  const setBranchesForActive = (rules: DynamicFlowBranchRuleV1[]) => {
    updateSpec((prev) => {
      const branchesByScreen: Record<string, DynamicFlowBranchRuleV1[]> = { ...(prev.branchesByScreen || {}) }
      const normalizedRules = (rules as UiBranchRule[]).map((r) => {
        const field = String(r?.field || '')
        const op = String(r?.op || '').toLowerCase()
        const needsValue = op === 'equals' || op === 'contains'
        const options = field ? choiceOptionsByField[field] : undefined
        if (!needsValue || !options?.length) return r
        const v = r?.value
        if (typeof v !== 'string') return r
        const current = v.trim()
        if (!current) return r
        // Se o usuário digitou o título (exibido), converte para o value (id) usado pelo preview.
        const match = options.find((o) => o.value === current) || options.find((o) => o.label.toLowerCase() === current.toLowerCase())
        return match ? { ...r, value: match.value } : r
      })

      const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
      const screensByTitle = new Map<string, string>()
      for (const s of prev.screens || []) {
        const title = norm((s as any)?.title || '')
        const id = String((s as any)?.id || '')
        if (title && id && !screensByTitle.has(title)) screensByTitle.set(title, id)
      }

      const autoNextRules = normalizedRules.map((r) => {
        const rr = r as UiBranchRule
        const op = String(rr?.op || '').toLowerCase()
        const field = String(rr?.field || '')
        const wantsAuto = rr.__auto_next !== false
        if (!wantsAuto) return rr
        if (op !== 'equals') return { ...rr, __auto_next: true }

        const value = String(rr?.value ?? '').trim()
        if (!field || !value) return { ...rr, __auto_next: true }

        const opts = choiceOptionsByField[field] || []
        const label = opts.find((o) => o.value === value)?.label
        const destId = label ? screensByTitle.get(norm(label)) : undefined
        if (!destId) return { ...rr, __auto_next: true }

        return { ...rr, next: destId, __auto_next: true }
      })

      branchesByScreen[activeScreenId] = autoNextRules as DynamicFlowBranchRuleV1[]

      // UX: se uma tela é destino de um Caminho, ela deve encerrar por padrão
      // (para não “cair” na próxima tela automática).
      const destIds = Array.from(
        new Set(
          autoNextRules
            .map((r) => (typeof r?.next === 'string' && r.next ? r.next : null))
            .filter(Boolean) as string[],
        ),
      )

      if (destIds.length === 0) return { ...prev, branchesByScreen }

      const screens = [...(prev.screens || [])]
      const routingModel: Record<string, string[]> = { ...(prev.routingModel || {}) }
      const defaultNextByScreen: Record<string, string | null> = { ...(prev.defaultNextByScreen || {}) }

      for (const destId of destIds) {
        const idx = screens.findIndex((s) => s.id === destId)
        if (idx < 0) continue
        const screen = screens[idx] as any
        const hasOwnBranches = Array.isArray(branchesByScreen?.[destId]) && branchesByScreen[destId].length > 0
        if (hasOwnBranches) continue

        const actionType = String(screen?.action?.type || '').toLowerCase()
        const hasAutoNext = Array.isArray(routingModel?.[destId]) ? routingModel[destId].length > 0 : false
        const alreadyFinal = !!screen?.terminal || actionType === 'complete' || !hasAutoNext
        if (alreadyFinal) continue

        screens[idx] = {
          ...screen,
          terminal: true,
          action: { type: 'complete', label: 'Concluir' },
        }
        routingModel[destId] = []
        defaultNextByScreen[destId] = null
      }

      try {
        const preview = destIds.slice(0, 6).map((id) => {
          const s = screens.find((x) => x.id === id) as any
          return {
            id,
            terminal: !!s?.terminal,
            actionType: String(s?.action?.type || ''),
            routingNext: Array.isArray(routingModel?.[id]) ? routingModel[id][0] || null : null,
            defaultNext: defaultNextByScreen?.[id] ?? undefined,
          }
        })
        // #region agent log
        // #endregion agent log
      } catch {}

      return { ...prev, branchesByScreen, screens, routingModel, defaultNextByScreen }
    })
  }

  const makeScreenFinal = (screenId: string) => {
    updateSpec((prev) => {
      const screens = [...(prev.screens || [])]
      const idx = screens.findIndex((s) => s.id === screenId)
      if (idx < 0) return prev
      const current = screens[idx] as any
      screens[idx] = {
        ...current,
        terminal: true,
        action: { type: 'complete', label: (current?.action?.label && String(current.action.label).trim()) || 'Concluir' },
      }
      const routingModel: Record<string, string[]> = { ...(prev.routingModel || {}) }
      routingModel[screenId] = []
      const defaultNextByScreen: Record<string, string | null> = { ...(prev.defaultNextByScreen || {}) }
      defaultNextByScreen[screenId] = null
      return { ...prev, screens, routingModel, defaultNextByScreen }
    })
  }

  const patchActiveScreen = (patch: any) => {
    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === activeScreenId)
      if (idx < 0) return prev
      screens[idx] = { ...screens[idx], ...patch }
      return { ...prev, screens }
    })
  }

  const patchScreenById = (screenId: string, patch: any) => {
    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === screenId)
      if (idx < 0) return prev
      const current = screens[idx] as any
      // Se o título for data-binding (${data.*}), edita o __example__ ao invés da string binding.
      if (patch?.title !== undefined && typeof current.title === 'string') {
        const match = current.title.match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
        const key = match?.[1]
        if (key && current.data && typeof current.data === 'object' && (current.data as any)[key] && typeof (current.data as any)[key] === 'object') {
          const nextData = { ...(current.data as any) }
          const nextField = { ...((nextData as any)[key] as any), __example__: String(patch.title) }
          ;(nextData as any)[key] = nextField
          screens[idx] = { ...current, data: nextData }
          return { ...prev, screens }
        }
      }
      screens[idx] = { ...current, ...patch }
      return { ...prev, screens }
    })
  }

  const updateComponentByBuilderId = (screenId: string, builderId: string, patch: { text?: string; label?: string }) => {
    const walk = (nodes: any[], screenData: any): any[] =>
      nodes.map((n) => {
        if (!n || typeof n !== 'object') return n
        const id = String((n as any).__builder_id || '')
        if (id && id === builderId) {
          // Se o texto atual for data-binding (${data.*}), edita o __example__ ao invés do binding.
          if (patch.text !== undefined && typeof (n as any).text === 'string') {
            const m = String((n as any).text).match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
            const key = m?.[1]
            if (key && screenData && typeof screenData === 'object' && (screenData as any)[key] && typeof (screenData as any)[key] === 'object') {
              ;(screenData as any)[key] = { ...((screenData as any)[key] as any), __example__: String(patch.text) }
              const { text, ...rest } = patch as any
              return { ...n, ...rest }
            }
          }
          return { ...n, ...patch }
        }
        const children = Array.isArray((n as any).children) ? ((n as any).children as any[]) : null
        if (children?.length) {
          return { ...n, children: walk(children, screenData) }
        }
        return n
      })

    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === screenId)
      if (idx < 0) return prev
      const current = screens[idx] as any
      const components = Array.isArray(current.components) ? current.components : []
      const nextData = current.data && typeof current.data === 'object' ? { ...(current.data as any) } : current.data
      screens[idx] = { ...current, components: walk(components, nextData), ...(nextData ? { data: nextData } : {}) }
      return { ...prev, screens }
    })
  }

  const updateCtaForScreen = (screenId: string, patch: { label?: string; nextScreenId?: string }) => {
    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === screenId)
      if (idx < 0) return prev
      const current = screens[idx] as any
      const terminal = !!current.terminal

      const nextLabel = patch.label !== undefined ? patch.label : guessCtaLabel(current)
      const nextTo = patch.nextScreenId !== undefined ? patch.nextScreenId : (prev.routingModel?.[screenId]?.[0] || '')

      const routingModel: Record<string, string[]> = { ...(prev.routingModel || {}) }
      routingModel[screenId] = terminal ? [] : nextTo ? [nextTo] : []

      const action: any = { ...(current.action || {}) }
      action.type = terminal ? 'complete' : guessActionType(current)
      action.label = nextLabel
      if (action.type === 'navigate' && !terminal) {
        action.screen = nextTo || undefined
      }

      screens[idx] = { ...current, action }
      return { ...prev, screens, routingModel }
    })
  }

  const updateBookingServices = (services: Array<{ id: string; title: string }>) => {
    // #region agent log
    // #endregion
    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === 'BOOKING_START')
      if (idx >= 0) {
        const current = screens[idx] as any
        const data = current.data && typeof current.data === 'object' ? { ...(current.data as any) } : {}
        const existing = (data as any).services
        ;(data as any).services =
          existing && typeof existing === 'object'
            ? { ...(existing as any), __example__: services }
            : {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: { type: 'string' }, title: { type: 'string' } },
                },
                __example__: services,
              }
        screens[idx] = { ...current, data }
      }
      return { ...prev, screens, services }
    })
  }

  const updateBookingDateComponent = (mode: 'calendar' | 'dropdown') => {
    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === 'BOOKING_START')
      if (idx < 0) return { ...prev, dateComponent: mode }
      const current = screens[idx] as any
      const replace = (nodes: any[]): any[] =>
        nodes.map((n) => {
          if (!n || typeof n !== 'object') return n
          const children = Array.isArray((n as any).children) ? ((n as any).children as any[]) : null
          const name = String((n as any).name || '')
          if (name === 'selected_date') {
            const label = String((n as any).label || 'Data')
            const base: any = { ...(n as any), name: 'selected_date', label, required: true }
            if (mode === 'dropdown') {
              return { ...base, type: 'Dropdown', 'data-source': '${data.dates}' }
            }
            return {
              ...base,
              type: 'CalendarPicker',
              mode: 'single',
              'min-date': '${data.min_date}',
              'max-date': '${data.max_date}',
              'include-days': '${data.include_days}',
              'unavailable-dates': '${data.unavailable_dates}',
            }
          }
          if (children?.length) return { ...n, children: replace(children) }
          return n
        })

      const components = Array.isArray(current.components) ? current.components : []
      screens[idx] = { ...current, components: replace(components) }
      return { ...prev, screens, dateComponent: mode }
    })
  }

  useEffect(() => {
    // Selecionar algo no preview também “leva” para a tela correspondente.
    const key = (props.selectedEditorKey || '').trim()
    if (!key.startsWith('screen:')) return
    const parts = key.split(':')
    const screenId = parts[1]
    if (!screenId) return
    if (spec.screens.some((s) => s.id === screenId)) {
      setActiveScreenId(screenId)
    }
  }, [props.selectedEditorKey, spec.screens])

  const setActiveBlocks = (nextBlocks: any[]) => {
    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === activeScreenId)
      if (idx < 0) return prev
      screens[idx] = setBlocksForScreen(screens[idx] as any, nextBlocks)
      return { ...prev, screens }
    })
  }

  const addBlock = (type: BlockType) => {
    const newBlock = createNewBlock(type)
    const blockId = nanoid(8)
    ;(newBlock as any).__builder_id = blockId
    lastAddedRef.current = blockId
    setActiveBlocks([...blocks, newBlock])
  }

  const updateBlock = (idx: number, patch: any) => {
    const next = [...blocks]
    next[idx] = { ...next[idx], ...patch }
    // #region agent log
    try {
      const ds = (next[idx] as any)?.['data-source']
      const dsType = Array.isArray(ds) ? 'array' : typeof ds
      const dsCount = Array.isArray(ds) ? ds.length : null
    } catch {}
    // #endregion agent log
    setActiveBlocks(next)
  }

  const updateBlockText = (idx: number, nextText: string) => {
    const block = blocks[idx]
    const raw = typeof block?.text === 'string' ? block.text : ''
    const match = raw.match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
    const key = match?.[1]
    if (key && activeScreen?.data && typeof activeScreen.data === 'object') {
      updateSpec((prev) => {
        const screens = [...prev.screens]
        const sIdx = screens.findIndex((s) => s.id === activeScreenId)
        if (sIdx < 0) return prev
        const current = screens[sIdx] as any
        const data = { ...(current.data || {}) }
        const entry = { ...(data[key] || {}) }
        entry.__example__ = nextText
        data[key] = entry
        screens[sIdx] = { ...current, data }
        return { ...prev, screens }
      })
      return
    }
    updateBlock(idx, { text: nextText })
  }

  const moveBlock = (idx: number, dir: 'up' | 'down') => {
    const newIdx = dir === 'up' ? Math.max(0, idx - 1) : Math.min(blocks.length - 1, idx + 1)
    setActiveBlocks(moveItem(blocks, idx, newIdx))
  }

  const removeBlock = (idx: number) => {
    setActiveBlocks(blocks.filter((_, i) => i !== idx))
  }

  const setCta = (patch: { type?: DynamicFlowActionType; label?: string; nextScreenId?: string }) => {
    // #region agent log
    // #endregion
    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === activeScreenId)
      if (idx < 0) return prev
      const current = screens[idx] as any
      const terminal = !!current.terminal

      const nextType = patch.type || guessActionType(current)
      const nextLabel = patch.label !== undefined ? patch.label : guessCtaLabel(current)
      const nextTo =
        patch.nextScreenId !== undefined
          ? patch.nextScreenId
          : (prev.defaultNextByScreen?.[current.id] || prev.routingModel?.[current.id]?.[0] || '')

      const routingModel: Record<string, string[]> = { ...(prev.routingModel || {}) }
      routingModel[current.id] = terminal || nextType === 'complete' ? [] : nextTo ? [nextTo] : []

      const defaultNextByScreen: Record<string, string | null> = { ...(prev.defaultNextByScreen || {}) }
      defaultNextByScreen[current.id] = terminal || nextType === 'complete' ? null : nextTo || null

      const action: any = {
        type: terminal ? 'complete' : nextType,
        label: nextLabel,
      }

      if (!terminal && nextType === 'navigate' && nextTo) {
        action.screen = nextTo
      }

      if (!terminal && nextType === 'data_exchange') {
        const currentBlocks = getBlocksForScreen(current)
        const fieldNames = currentBlocks
          .map((b: any) => String(b?.name || '').trim())
          .filter(Boolean)
          .slice(0, 20)
        const payload: Record<string, unknown> = {}
        for (const n of fieldNames) payload[n] = `\${form.${n}}`
        action.payload = payload
        delete action.screen
      }
      if (action.type === 'navigate') {
        // Evita bug: payload em navigate quebra publish na Meta.
        delete action.payload
      } else if (current?.action?.payload && typeof current.action.payload === 'object' && !Array.isArray(current.action.payload)) {
        // Mantém payload existente em complete (ex.: confirmação, payload final) quando não estivermos gerando payload de data_exchange.
        if (action.payload === undefined) action.payload = { ...(current.action.payload as Record<string, unknown>) }
      }

      screens[idx] = { ...current, action }
      return { ...prev, screens, routingModel, defaultNextByScreen }
    })
  }

  const setActiveCompleteConfirmation = (patch: { enabled?: boolean; title?: string; footer?: string }) => {
    updateSpec((prev) => {
      const screens = [...prev.screens]
      const idx = screens.findIndex((s) => s.id === activeScreenId)
      if (idx < 0) return prev
      const current = screens[idx] as any
      const currentAction = (current?.action && typeof current.action === 'object' ? current.action : null) as any
      const actionType = String(currentAction?.type || guessActionType(current)).toLowerCase()
      if (actionType !== 'complete') return prev

      const basePayload =
        currentAction?.payload && typeof currentAction.payload === 'object' && !Array.isArray(currentAction.payload)
          ? { ...(currentAction.payload as Record<string, unknown>) }
          : {}

      if (patch.enabled !== undefined) {
        if (patch.enabled) {
          delete (basePayload as any).send_confirmation
        } else {
          ;(basePayload as any).send_confirmation = 'false'
        }
      }
      if (patch.title !== undefined) {
        const v = String(patch.title || '').trim()
        if (v) (basePayload as any).confirmation_title = v
        else delete (basePayload as any).confirmation_title
      }
      if (patch.footer !== undefined) {
        const v = String(patch.footer || '').trim()
        if (v) (basePayload as any).confirmation_footer = v
        else delete (basePayload as any).confirmation_footer
      }

      const nextAction = { ...currentAction, type: 'complete', payload: basePayload }
      screens[idx] = { ...current, action: nextAction }
      return { ...prev, screens }
    })
  }

  const handleAddScreen = () => {
    updateSpec((prev) => {
      const nextId = makeNextScreenId(prev.screens.map((s) => s.id))
      const idx = prev.screens.length + 1
      const nextScreens = [...prev.screens]

      // Regra UX: ao adicionar uma nova tela, a tela anterior deixa de ser “final”
      // e a nova tela vira “final” automaticamente (Continuar -> Enviar).
      const lastIndex = nextScreens.length - 1
      if (lastIndex >= 0) {
        const last = nextScreens[lastIndex] as any
        const wasTerminal = !!last.terminal || String(last?.action?.type || '').toLowerCase() === 'complete'
        nextScreens[lastIndex] = {
          ...last,
          terminal: false,
          action: {
            type: 'navigate',
            // Se antes era “final”, não reaproveita label tipo “Enviar/Concluir”.
            label: wasTerminal ? 'Continuar' : (last.action?.label && String(last.action.label).trim()) || 'Continuar',
            screen: nextId,
          },
        }
      }

      nextScreens.push({
        id: nextId,
        title: `Tela ${idx}`,
        terminal: true,
        components: [
          {
            type: 'Form',
            name: 'form',
            children: [{ type: 'TextBody', text: 'Nova tela' }],
          },
        ],
        action: { type: 'complete', label: 'Enviar' },
      })

      const routingModel: Record<string, string[]> = { ...(prev.routingModel || {}) }
      const last = prev.screens[prev.screens.length - 1]
      if (last) routingModel[last.id] = [nextId]
      routingModel[nextId] = []

      const defaultNextByScreen: Record<string, string | null> = { ...(prev.defaultNextByScreen || {}) }
      if (last) defaultNextByScreen[last.id] = nextId
      defaultNextByScreen[nextId] = null

      setActiveScreenId(nextId)
      return { ...prev, screens: nextScreens, routingModel, defaultNextByScreen }
    })
  }

  const handleRemoveScreen = () => {
    if (!activeScreen) return
    updateSpec((prev) => {
      if (prev.screens.length <= 1) return prev
      const nextScreens = prev.screens.filter((s) => s.id !== activeScreenId)

      const routingModel: Record<string, string[]> = {}
      for (const s of nextScreens) {
        const first = (prev.routingModel?.[s.id] || []).find((id) => nextScreens.some((x) => x.id === id))
        routingModel[s.id] = first ? [first] : []
      }

      const defaultNextByScreen: Record<string, string | null> = {}
      for (const s of nextScreens) {
        const raw = prev.defaultNextByScreen?.[s.id] || null
        defaultNextByScreen[s.id] = raw && nextScreens.some((x) => x.id === raw) ? raw : null
      }

      const branchesByScreen: Record<string, DynamicFlowBranchRuleV1[]> = {}
      for (const s of nextScreens) {
        const rules = prev.branchesByScreen?.[s.id] || []
        const cleaned = rules.filter((r) => r && (r.next === null || nextScreens.some((x) => x.id === r.next)))
        if (cleaned.length) branchesByScreen[s.id] = cleaned
      }

      setActiveScreenId(nextScreens[0]?.id || 'SCREEN_A')
      return { ...prev, screens: nextScreens, routingModel, defaultNextByScreen, branchesByScreen }
    })
  }

  const renderBlockEditor = (block: any, idx: number) => {
    const type = String(block?.type || '')
    const builderId = String(block?.__builder_id || `${activeScreenId}_${idx}`)

    const showLabel = type !== 'TextHeading' && type !== 'TextSubheading' && type !== 'TextBody' && type !== 'TextCaption'
    const showText = type === 'TextHeading' || type === 'TextSubheading' || type === 'TextBody' || type === 'TextCaption'
    const isOptIn = type === 'OptIn'
    const isTextInput = type === 'TextInput' || type === 'TextEntry'
    const isTextArea = type === 'TextArea'
    const isDate = type === 'CalendarPicker' || type === 'DatePicker'
    const isChoice = type === 'Dropdown' || type === 'RadioButtonsGroup' || type === 'CheckboxGroup'

    const dataSourceKey = getDataBindingKey(block?.['data-source'])
    const isBoundList = !!dataSourceKey
    const resolvedList = isBoundList ? resolveDataBindingList(block?.['data-source'], activeScreen) : null
    const rawOptions = Array.isArray(block?.['data-source']) ? (block['data-source'] as any[]) : []
    const options = isBoundList ? (resolvedList || []) : rawOptions
    const baseOptions = options.length ? options : isBoundList ? [] : defaultOptions()

    const updateBoundOptions = (nextOptions: any[]) => {
      if (!dataSourceKey) return
      const normalizedOptions = nextOptions
        .map((opt) => ({
          id: typeof opt?.id === 'string' ? opt.id : String(opt?.id ?? ''),
          title: typeof opt?.title === 'string' ? opt.title : String(opt?.title ?? ''),
        }))
        .filter((opt) => opt.id.trim() && opt.title.trim())
      const hasTrimmedId = nextOptions.some((opt: any) => typeof opt?.id === 'string' && opt.id.trim().length !== opt.id.length)
      const hasTrimmedTitle = nextOptions.some((opt: any) => typeof opt?.title === 'string' && opt.title.trim().length !== opt.title.length)
      // #region agent log
      // #endregion agent log
      updateSpec((prev) => {
        const screens = [...prev.screens]
        const sidx = screens.findIndex((s) => s.id === activeScreenId)
        // #region agent log
        // #endregion agent log
        if (sidx < 0) return prev
        const current = screens[sidx] as any
        const nextData = current.data && typeof current.data === 'object' ? { ...current.data } : {}
        const currentEntry = nextData[dataSourceKey] && typeof nextData[dataSourceKey] === 'object' ? { ...nextData[dataSourceKey] } : {}
        nextData[dataSourceKey] = { ...currentEntry, __example__: normalizedOptions }
        screens[sidx] = { ...current, data: nextData }
        const withServices =
          dataSourceKey === 'services'
            ? { ...prev, screens, services: normalizedOptions }
            : { ...prev, screens }
        // #region agent log
        // #endregion agent log
        return withServices
      })
    }

    return (
      <div key={builderId} className="py-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            {showText && (
              <div className="space-y-2">
                {/* #region agent log */}
                {/* #endregion */}
                <label className="block text-xs uppercase tracking-widest text-slate-500">
                  {block?.__editor_label || 'Texto'}
                </label>
                <Textarea
                  value={resolveDataBindingText(block?.text || '', activeScreen)}
                  onChange={(e) => updateBlockText(idx, e.target.value)}
                  className="min-h-18"
                  placeholder="Digite o texto"
                  data-block-focus={builderId}
                />
              </div>
            )}

            {showLabel && (
              <div className="mt-3">
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Pergunta</label>
                <Input
                  value={String(block?.label || '')}
                  onChange={(e) => updateBlock(idx, { label: e.target.value })}
                  placeholder="Digite a pergunta"
                  data-block-focus={builderId}
                />
              </div>
            )}

            {(isTextInput || isTextArea || isDate || isChoice) && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-slate-300">Obrigatório</div>
                  <div className="text-[11px] text-slate-500">O usuário precisa preencher</div>
                </div>
                <Switch checked={!!block?.required} onCheckedChange={(checked) => updateBlock(idx, { required: checked })} />
              </div>
            )}

            {isOptIn && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs uppercase tracking-widest text-slate-500">Texto do opt-in</label>
                <Textarea value={resolveDataBindingText(block?.text || '', activeScreen)} onChange={(e) => updateBlockText(idx, e.target.value)} />
              </div>
            )}

            {isChoice && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs uppercase tracking-widest text-slate-500">Opções</label>
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] text-slate-200 hover:text-white hover:bg-[var(--ds-bg-hover)]"
                    onClick={() => {
                      // #region agent log
                      // #endregion agent log
                      const next = [...baseOptions]
                      const n = next.length + 1
                      next.push({ id: `opcao_${n}`, title: `Opção ${n}` })
                      if (isBoundList) {
                        updateBoundOptions(next)
                      } else {
                        updateBlock(idx, { 'data-source': next })
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar opção
                  </Button>
                </div>
                <div className="space-y-2">
                  {baseOptions.map((opt: any, oidx: number) => (
                    <div key={`${builderId}_${oidx}`} className="grid grid-cols-1 md:grid-cols-[140px_1fr_auto] gap-2 items-center">
                      <Input
                        value={String(opt?.id || '')}
                        onChange={(e) => {
                          // #region agent log
                          // #endregion agent log
                          const next = [...baseOptions]
                          next[oidx] = { ...next[oidx], id: e.target.value }
                          if (isBoundList) {
                            updateBoundOptions(next)
                          } else {
                            updateBlock(idx, { 'data-source': next })
                          }
                        }}
                        className="font-mono text-xs"
                        placeholder="id"
                      />
                      <Input
                        value={String(opt?.title || '')}
                        onChange={(e) => {
                          // #region agent log
                          // #endregion agent log
                          const next = [...baseOptions]
                          next[oidx] = { ...next[oidx], title: e.target.value }
                          if (isBoundList) {
                            updateBoundOptions(next)
                          } else {
                            updateBlock(idx, { 'data-source': next })
                          }
                        }}
                        placeholder="Título"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                        onClick={() => {
                          const next = baseOptions.filter((_: any, i: number) => i !== oidx)
                          if (isBoundList) {
                            updateBoundOptions(next)
                          } else {
                            updateBlock(idx, { 'data-source': next })
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {resolvedList ? (
                  <div className="text-[11px] text-slate-500">Opções dinâmicas (tempo real).</div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
              disabled={idx === 0}
              onClick={() => moveBlock(idx, 'up')}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
              disabled={idx === blocks.length - 1}
              onClick={() => moveBlock(idx, 'down')}
            >
              ↓
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red-500/20 bg-[var(--ds-bg-surface)]/30 hover:bg-red-500/10"
              onClick={() => removeBlock(idx)}
            >
              <Trash2 className="h-4 w-4 text-red-300" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <InspectorPanel
        spec={spec}
        selectedEditorKey={props.selectedEditorKey || null}
        onUpdateScreenTitle={(screenId, title) => patchScreenById(screenId, { title })}
        onUpdateCta={(screenId, patch) => updateCtaForScreen(screenId, patch)}
        onUpdateComponent={(screenId, builderId, patch) => updateComponentByBuilderId(screenId, builderId, patch)}
        onUpdateBookingServices={(services) => updateBookingServices(services)}
        onUpdateBookingDateComponent={(mode) => updateBookingDateComponent(mode)}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">Telas</div>
          <div className="text-xs text-slate-400">Monte o conteúdo de cada tela e escolha para onde o botão vai.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-slate-500">{saveStatusText}</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] px-2"
                aria-label="Ações"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-[var(--ds-border-subtle)] text-white min-w-56">
              <DropdownMenuItem onClick={handleAddScreen}>Adicionar tela</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={spec.screens.length <= 1} onClick={handleRemoveScreen}>
                Remover tela
              </DropdownMenuItem>
              {props.onOpenAdvanced ? (
                <>
                  <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
                  <DropdownMenuItem onClick={props.onOpenAdvanced}>Ajustes avançados</DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
              <DropdownMenuItem disabled={!canSave} onClick={save}>
                Salvar agora
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeScreenId} onValueChange={setActiveScreenId}>
        <TabsList className="bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)]">
          {spec.screens.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="text-xs">
              {resolveDataBindingText(s.title || s.id, s).slice(0, 18)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeScreenId} className="space-y-6 pt-2">
          <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Título da tela</label>
                <Input
                  value={resolveDataBindingText(activeScreen?.title || '', activeScreen)}
                  onChange={(e) => patchScreenById(activeScreenId, { title: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-slate-300">Tela final</div>
                  <div className="text-[11px] text-slate-500">O botão vira “Concluir”</div>
                </div>
                <Switch
                  checked={!!activeScreen?.terminal}
                  onCheckedChange={(checked) => {
                    patchActiveScreen({ terminal: checked })
                    setCta({ type: checked ? 'complete' : 'navigate', nextScreenId: checked ? '' : nextScreenId })
                  }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--ds-border-subtle)] pt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Conteúdo</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" className="bg-white text-black hover:bg-slate-200">
                    <Plus className="h-4 w-4" />
                    Adicionar
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-slate-900 border-[var(--ds-border-subtle)] text-white min-w-64">
                  {Object.entries(BLOCK_TYPE_LABEL).map(([k, label]) => (
                    <DropdownMenuItem key={k} onClick={() => addBlock(k as BlockType)}>
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {blocks.length === 0 ? (
              <div className="mt-4 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-6 py-8 text-center text-slate-400">
                <div className="text-sm text-slate-300">Adicione o primeiro bloco para montar sua tela.</div>
              </div>
            ) : (
              <div className="divide-y divide-white/10 mt-4">{blocks.map(renderBlockEditor)}</div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-4">
            <div className="text-sm font-semibold text-white">Botão</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Texto do botão</label>
                <Input
                  value={ctaLabel}
                  onChange={(e) => {
                    // #region agent log
                    // #endregion
                    setCta({ label: e.target.value })
                  }}
                  placeholder="Continuar"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Próxima tela</label>
                <select
                  value={ctaType === 'complete' || !!activeScreen?.terminal ? '' : nextScreenId}
                  onChange={(e) => setCta({ nextScreenId: e.target.value })}
                  disabled={ctaType === 'complete' || !!activeScreen?.terminal}
                  className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-50"
                >
                  <option value="">— Concluir —</option>
                  {spec.screens
                    .filter((x) => x.id !== activeScreenId)
                    .map((x) => (
                      <React.Fragment key={x.id}>
                        {/* #region agent log */}
                        {(() => {
                          const resolved = resolveDataBindingText(x.title || x.id, x)
                          return null
                        })()}
                        {/* #endregion agent log */}
                        <option value={x.id}>{resolveDataBindingText(x.title || x.id, x)}</option>
                      </React.Fragment>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Confirmação agora fica no passo 3 (Finalizar) */}

          <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Caminhos</div>
                <div className="text-xs text-slate-400">Decida para onde ir depois do botão, com ou sem ramificações.</div>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] text-slate-200 hover:text-white hover:bg-[var(--ds-bg-hover)]"
                onClick={() => {
                  const firstField = pathFieldOptions[0]?.name || ''
                  const opts = firstField ? choiceOptionsByField[firstField] : undefined
                  const inferred =
                    firstField && opts && opts.length
                      ? spec.screens.find((s) => String(s?.title || '').trim().toLowerCase() === String(opts[0]?.label || '').trim().toLowerCase())
                      : null
                  const next: DynamicFlowBranchRuleV1 = {
                    field: firstField,
                    op: 'equals',
                    value: (opts && opts.length ? opts[0].value : '') as any,
                    next: inferred?.id || null,
                  }
                  setBranchesForActive([...(activeBranches || []), { ...(next as any), __auto_next: true } as any])
                }}
                disabled={pathFieldOptions.length === 0}
              >
                <Plus className="h-4 w-4" />
                Adicionar regra
              </Button>
            </div>

            {pathFieldOptions.length === 0 ? (
              <div className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-4 py-3 text-sm text-slate-300">
                Adicione um campo (ex: texto, lista, escolha) para criar ramificações.
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Destino padrão</label>
                <select
                  value={defaultNextId || ''}
                  onChange={(e) => setDefaultNextForActive(e.target.value || null)}
                  className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                >
                  <option value="">— Concluir —</option>
                  {spec.screens
                    .filter((x) => x.id !== activeScreenId)
                    .map((x) => (
                      <React.Fragment key={x.id}>
                        {/* #region agent log */}
                        {(() => {
                          const resolved = resolveDataBindingText(x.title || x.id, x)
                          return null
                        })()}
                        {/* #endregion agent log */}
                      <option value={x.id}>{resolveDataBindingText(x.title || x.id, x)}</option>
                      </React.Fragment>
                    ))}
                </select>
                {activeBranches.length > 0 ? (
                  <div className="mt-2 text-[11px] text-slate-500">Obrigatório quando há regras (pode ser “Concluir”).</div>
                ) : null}
              </div>
              <div className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-3">
                <div className="text-xs font-medium text-slate-300">Quando uma regra casar</div>
                <div className="text-[11px] text-slate-500 mt-1">O primeiro caminho que casar ganha.</div>
              </div>
            </div>

            {activeBranches.length > 0 ? (
              <div className="space-y-3">
                {activeBranches.map((rule, idx) => {
                  const op = String(rule.op || 'equals')
                  const needsValue = op === 'equals' || op === 'contains' || op === 'gt' || op === 'lt'
                  const choiceOptions = choiceOptionsByField[String(rule.field || '')] || []
                  const canUseChoiceSelect = (op === 'equals' || op === 'contains') && choiceOptions.length > 0
                  const inferredDestId =
                    canUseChoiceSelect && op === 'equals'
                      ? (() => {
                          const val = String((rule as any)?.value ?? '').trim()
                          const label = choiceOptions.find((o) => o.value === val)?.label
                          if (!label) return ''
                          const dest = spec.screens.find(
                            (s) => String(s?.title || '').trim().toLowerCase() === String(label).trim().toLowerCase(),
                          )
                          return dest?.id || ''
                        })()
                      : ''
                  const isAutoNext = (rule as any)?.__auto_next !== false
                  const destId = rule.next ? String(rule.next) : ''
                  const dest = destId ? spec.screens.find((s) => s.id === destId) : null
                  const destNext = destId ? (spec.routingModel?.[destId] || [])[0] || '' : ''
                  const destIsFinal = !!dest?.terminal || String((dest as any)?.action?.type || '').toLowerCase() === 'complete' || !destNext
                  return (
                    <div key={`${activeScreenId}_branch_${idx}`} className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-3">
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_160px_1fr_200px_auto] gap-2 items-end">
                        <div className="min-w-0">
                          <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Campo</label>
                          <select
                            value={String(rule.field || '')}
                            onChange={(e) => {
                              const next = [...activeBranches]
                              const field = e.target.value
                              const opts = field ? choiceOptionsByField[field] : undefined
                              const nextValue =
                                (String(next[idx]?.op || '').toLowerCase() === 'equals' || String(next[idx]?.op || '').toLowerCase() === 'contains') &&
                                opts &&
                                opts.length
                                  ? opts[0].value
                                  : next[idx]?.value
                              next[idx] = { ...next[idx], field, ...(nextValue !== undefined ? { value: nextValue as any } : {}) }
                              setBranchesForActive(next)
                            }}
                            className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                          >
                            {pathFieldOptions.map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.label} ({f.name})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="min-w-0">
                          <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Operador</label>
                          <select
                            value={op}
                            onChange={(e) => {
                              const next = [...activeBranches]
                              next[idx] = { ...next[idx], op: e.target.value as any }
                              setBranchesForActive(next)
                            }}
                            className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                          >
                            <option value="is_filled">preenchido</option>
                            <option value="is_empty">vazio</option>
                            <option value="equals">é igual a</option>
                            <option value="contains">contém</option>
                            <option value="gt">maior que</option>
                            <option value="lt">menor que</option>
                            <option value="is_true">é verdadeiro</option>
                            <option value="is_false">é falso</option>
                          </select>
                        </div>

                        <div className="min-w-0">
                          <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Valor</label>
                          {canUseChoiceSelect ? (
                            <select
                              value={needsValue ? String(rule.value ?? '') : ''}
                              onChange={(e) => {
                                const next = [...activeBranches]
                                next[idx] = { ...(next[idx] as any), value: e.target.value, __auto_next: true }
                                setBranchesForActive(next)
                              }}
                              disabled={!needsValue}
                              className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-50"
                            >
                              {choiceOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              value={needsValue ? String(rule.value ?? '') : ''}
                              onChange={(e) => {
                                const next = [...activeBranches]
                                next[idx] = { ...next[idx], value: e.target.value }
                                setBranchesForActive(next)
                              }}
                              disabled={!needsValue}
                              placeholder={needsValue ? 'valor…' : '—'}
                            />
                          )}
                        </div>

                        <div className="min-w-0">
                          <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Destino</label>
                          <select
                            value={rule.next || ''}
                            onChange={(e) => {
                              const next = [...activeBranches] as any[]
                              // Se o usuário mexeu aqui, ele quer override explícito do automático.
                              next[idx] = { ...(next[idx] || {}), next: e.target.value ? e.target.value : null, __auto_next: false }
                              setBranchesForActive(next as any)
                            }}
                            className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                          >
                            <option value="">— Concluir —</option>
                            {spec.screens
                              .filter((x) => x.id !== activeScreenId)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.title || x.id}
                                </option>
                              ))}
                          </select>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] self-end"
                          onClick={() => {
                            const next = activeBranches.filter((_, i) => i !== idx)
                            setBranchesForActive(next)
                          }}
                          aria-label="Remover regra"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {inferredDestId && isAutoNext ? (
                        <div className="text-[11px] text-slate-500">Automático (pela opção escolhida).</div>
                      ) : null}
                      {destId && dest && !destIsFinal ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 py-2">
                          <div className="text-[11px] text-slate-400">
                            Essa tela ainda continua para <span className="text-slate-200">{destNext || '—'}</span>. Se quiser encerrar nela, marque como final.
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] text-[12px]"
                            onClick={() => makeScreenFinal(destId)}
                          >
                            Marcar como final
                          </Button>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-400">Sem ramificações. (Opcional) Adicione regras para desviar para telas diferentes.</div>
            )}
          </div>

          {issues.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <div className="font-semibold mb-1">Ajustes necessários</div>
              <ul className="list-disc pl-5 space-y-1">
                {issues.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

