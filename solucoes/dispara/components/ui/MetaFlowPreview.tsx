'use client'

import React, { useMemo, useState } from 'react'
import { X, MoreVertical, ArrowLeft } from 'lucide-react'

type FlowComponent = Record<string, any>

type FlowScreen = {
  id?: string
  title?: string
  terminal?: boolean
  data?: Record<string, unknown>
  editorTitleKey?: string
  layout?: {
    type?: string
    children?: FlowComponent[]
  }
}

type ParsedFlow = {
  version?: string
  routingModel?: Record<string, string[]>
  screens?: FlowScreen[]
}

type SmartPathsRule = {
  field: string
  op: string
  value?: unknown
  next: string | null
}

type SmartPaths = {
  defaultNextByScreen?: Record<string, string | null>
  branchesByScreen?: Record<string, SmartPathsRule[]>
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function parseFlowJson(flowJson: unknown): ParsedFlow {
  if (!isPlainObject(flowJson)) return {}

  const screens = Array.isArray((flowJson as any).screens) ? (flowJson as any).screens : []
  const routingModel = isPlainObject((flowJson as any).routing_model)
    ? ((flowJson as any).routing_model as Record<string, string[]>)
    : undefined

  return {
    version: typeof (flowJson as any).version === 'string' ? (flowJson as any).version : undefined,
    routingModel,
    screens: screens.map((screen: any) => {
      const layout = isPlainObject(screen?.layout) ? screen.layout : undefined
      return {
        id: typeof screen?.id === 'string' ? screen.id : undefined,
        title: typeof screen?.title === 'string' ? screen.title : undefined,
        terminal: typeof screen?.terminal === 'boolean' ? screen.terminal : undefined,
        data: isPlainObject(screen?.data) ? screen.data : undefined,
        editorTitleKey: typeof screen?.__editor_title_key === 'string' ? screen.__editor_title_key : undefined,
        layout: layout
          ? {
              type: typeof (layout as any).type === 'string' ? (layout as any).type : undefined,
              children: Array.isArray((layout as any).children) ? (layout as any).children : [],
            }
          : undefined,
      }
    }),
  }
}

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function getDataExamples(data?: Record<string, unknown>): Record<string, unknown> {
  if (!data) return {}
  const entries = Object.entries(data)
  return entries.reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (isPlainObject(value) && '__example__' in value) {
      acc[key] = (value as any).__example__
    } else {
      acc[key] = value
    }
    return acc
  }, {})
}

function resolveDataBindings(text: string, dataExamples: Record<string, unknown>): string {
  if (!text.includes('${data.')) return text
  return text.replace(/\$\{data\.([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = dataExamples[key]
    if (value === undefined || value === null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
  })
}

function getEditorKey(comp: FlowComponent): string | null {
  return typeof comp?.__editor_key === 'string' ? comp.__editor_key : null
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .trim()
}

function getFooter(children: FlowComponent[], resolveText: (text: string) => string): { label: string } {
  const footer = children.find((c) => c && c.type === 'Footer')
  const raw = footer ? s(footer.label, '') : ''
  const resolved = resolveText(raw)
  const label = resolved.trim() || 'Continue'
  if (resolved !== label) {
    // #region agent log
    // #endregion
  }
  return { label }
}

function flattenChildren(children: FlowComponent[]): FlowComponent[] {
  return (children || []).flatMap((child) => {
    if (child?.type === 'Form' && Array.isArray(child.children)) {
      return flattenChildren(child.children as FlowComponent[])
    }
    return [child]
  })
}

function renderBasicText(
  text: string,
  idx: number,
  resolveText: (text: string) => string,
  editorKey?: string | null,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
  onEditKey?: (key: string) => void,
  onContextMenu?: (e: React.MouseEvent, key: string) => void,
) {
  const t = stripMarkdown(resolveText(text || ''))
  if (!t) return null
  const selected = !!editorKey && !!selectedKey && editorKey === selectedKey
  return (
    <div
      key={`bt_${idx}`}
      className={`text-[14px] leading-snug text-slate-100 whitespace-pre-wrap ${
        editorKey ? 'cursor-pointer hover:bg-[var(--ds-bg-hover)] px-1 rounded transition-colors' : ''
      } ${selected ? 'ring-2 ring-primary-400/40 bg-primary-500/5' : ''}`}
      onClick={() => {
        if (editorKey && onSelectKey) onSelectKey(editorKey)
        if (editorKey && onEditKey) onEditKey(editorKey)
      }}
      onContextMenu={(e) => {
        if (editorKey && onContextMenu) {
          e.preventDefault()
          onContextMenu(e, editorKey)
        }
      }}
    >
      {t}
    </div>
  )
}

function getOptions(
  comp: FlowComponent,
  dataExamples: Record<string, unknown>,
): Array<{ id?: string; title?: string }> {
  if (typeof comp['data-source'] === 'string') {
    const match = comp['data-source'].match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
    const key = match?.[1]
    const example = key ? dataExamples[key] : undefined
    if (Array.isArray(example)) return example as Array<{ id?: string; title?: string }>
  }
  if (Array.isArray(comp['data-source'])) return comp['data-source'] as Array<{ id?: string; title?: string }>
  if (Array.isArray(comp.options)) return comp.options as Array<{ id?: string; title?: string }>
  return []
}

function renderTextEntry(
  comp: FlowComponent,
  idx: number,
  values: Record<string, any>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  resolveText: (text: string) => string,
  editorKey?: string | null,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
  onEditKey?: (key: string) => void,
) {
  const label = resolveText(s(comp.label, 'Campo') || 'Campo').trim()
  const inputType = s(comp['input-type'], '').trim()
  const name = s(comp.name, `field_${idx}`)
  const type = inputType === 'email' ? 'email' : inputType === 'phone' ? 'tel' : inputType === 'number' ? 'number' : 'text'
  const value = values[name] ?? ''
  const selected = !!editorKey && !!selectedKey && editorKey === selectedKey
  return (
    <div key={`te_${idx}`} className="space-y-2">
      <div
        className={`text-[14px] text-slate-200 ${editorKey ? 'cursor-pointer' : ''} ${
          selected ? 'ring-2 ring-primary-400/40 bg-primary-500/5 rounded px-1' : ''
        }`}
        onClick={() => {
          if (editorKey && onSelectKey) onSelectKey(editorKey)
          if (editorKey && onEditKey) onEditKey(editorKey)
        }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
        placeholder="Digite aqui"
        className="h-12 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-4 text-[15px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
      />
    </div>
  )
}

function renderTextArea(
  comp: FlowComponent,
  idx: number,
  values: Record<string, any>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  resolveText: (text: string) => string,
  editorKey?: string | null,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
  onEditKey?: (key: string) => void,
) {
  const label = resolveText(s(comp.label, 'Campo') || 'Campo').trim()
  const name = s(comp.name, `field_${idx}`)
  const value = values[name] ?? ''
  const selected = !!editorKey && !!selectedKey && editorKey === selectedKey
  return (
    <div key={`ta_${idx}`} className="space-y-2">
      <div
        className={`text-[14px] text-slate-200 ${editorKey ? 'cursor-pointer' : ''} ${
          selected ? 'ring-2 ring-primary-400/40 bg-primary-500/5 rounded px-1' : ''
        }`}
        onClick={() => {
          if (editorKey && onSelectKey) onSelectKey(editorKey)
          if (editorKey && onEditKey) onEditKey(editorKey)
        }}
      >
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
        placeholder="Digite aqui"
        rows={3}
        className="w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-4 py-3 text-[15px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
      />
    </div>
  )
}

function renderOptIn(
  comp: FlowComponent,
  idx: number,
  values: Record<string, any>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  resolveText: (text: string) => string,
  editorKey?: string | null,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
  onEditKey?: (key: string) => void,
) {
  const text = resolveText((s(comp.text, '') || s(comp.label, '') || '').trim())
  if (!text) return null
  const name = s(comp.name, `optin_${idx}`)
  const checked = !!values[name]

  // Heurística simples pra ficar parecido com os prints: realçar “Leia mais”.
  const parts = text.split(/(Leia mais)/i)

  const handleEdit = () => {
    if (editorKey && onSelectKey) onSelectKey(editorKey)
    if (editorKey && onEditKey) onEditKey(editorKey)
  }
  const selected = !!editorKey && !!selectedKey && editorKey === selectedKey

  return (
    <label key={`oi_${idx}`} className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.checked }))}
        className="mt-1 h-5 w-5 rounded border border-white/30 bg-[var(--ds-bg-hover)] accent-primary-400"
      />
      <div
        className={`text-[15px] text-slate-300 leading-snug ${
          selected ? 'ring-2 ring-primary-400/40 bg-primary-500/5 rounded px-1' : ''
        }`}
        onClick={handleEdit}
      >
        {parts.map((p, i) => {
          if (/^Leia mais$/i.test(p)) {
            return (
              <span key={i} className="text-primary-400">
                {p}
              </span>
            )
          }
          return <React.Fragment key={i}>{p}</React.Fragment>
        })}
      </div>
    </label>
  )
}

function isRequiredSatisfied(comp: FlowComponent, values: Record<string, any>, idx: number): boolean {
  if (!comp?.required) return true
  const type = s(comp?.type, '')
  const name = s(comp.name, `field_${idx}`)
  const value = values[name]

  if (type === 'CheckboxGroup') return Array.isArray(value) && value.length > 0
  if (type === 'OptIn') return !!value
  return value !== undefined && value !== null && String(value).trim().length > 0
}

function renderRadioGroup(
  comp: FlowComponent,
  idx: number,
  values: Record<string, any>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  dataExamples: Record<string, unknown>,
  resolveText: (text: string) => string,
  editorKey?: string | null,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
  onEditKey?: (key: string) => void,
) {
  const label = resolveText((s(comp.label, '') || '').trim())
  const options = getOptions(comp, dataExamples)
  const name = s(comp.name, `radio_${idx}`)
  const selected = values[name] ?? ''
  const labelSelected = !!editorKey && !!selectedKey && editorKey === selectedKey

  return (
    <div key={`rg_${idx}`} className="space-y-3">
      {label ? (
        <div
          className={`text-[14px] text-slate-200 ${editorKey ? 'cursor-pointer' : ''} ${
            labelSelected ? 'ring-2 ring-primary-400/40 bg-primary-500/5 rounded px-1' : ''
          }`}
          onClick={() => {
            if (editorKey && onSelectKey) onSelectKey(editorKey)
            if (editorKey && onEditKey) onEditKey(editorKey)
          }}
        >
          {label}
        </div>
      ) : null}
      <div className="space-y-3">
        {(options.length ? options : [{ id: 'opcao_1', title: 'Opção 1' }]).map((o: any, j: number) => (
          <label key={`rg_${idx}_${j}`} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-4 py-3 cursor-pointer">
            <div className="text-[15px] text-slate-300">{s(o?.title, 'Opção')}</div>
            <input
              type="radio"
              name={name}
              value={s(o?.id, s(o?.title, String(j)))}
              checked={selected === s(o?.id, s(o?.title, String(j)))}
              onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
              className="h-5 w-5 accent-primary-400"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function renderCheckboxGroup(
  comp: FlowComponent,
  idx: number,
  values: Record<string, any>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  dataExamples: Record<string, unknown>,
  resolveText: (text: string) => string,
  editorKey?: string | null,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
  onEditKey?: (key: string) => void,
) {
  const label = resolveText((s(comp.label, '') || '').trim())
  const options = getOptions(comp, dataExamples)
  const name = s(comp.name, `check_${idx}`)
  const selected = Array.isArray(values[name]) ? values[name] : []
  const labelSelected = !!editorKey && !!selectedKey && editorKey === selectedKey

  return (
    <div key={`cg_${idx}`} className="space-y-3">
      {label ? (
        <div
          className={`text-[14px] text-slate-200 ${editorKey ? 'cursor-pointer' : ''} ${
            labelSelected ? 'ring-2 ring-primary-400/40 bg-primary-500/5 rounded px-1' : ''
          }`}
          onClick={() => {
            if (editorKey && onSelectKey) onSelectKey(editorKey)
            if (editorKey && onEditKey) onEditKey(editorKey)
          }}
        >
          {label}
        </div>
      ) : null}
      <div className="space-y-3">
        {(options.length ? options : [{ id: 'opcao_1', title: 'Opção 1' }]).map((o: any, j: number) => (
          <label key={`cg_${idx}_${j}`} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-4 py-3 cursor-pointer">
            <div className="text-[15px] text-slate-300">{s(o?.title, 'Opção')}</div>
            <input
              type="checkbox"
              value={s(o?.id, s(o?.title, String(j)))}
              checked={selected.includes(s(o?.id, s(o?.title, String(j))))}
              onChange={(e) => {
                const v = s(o?.id, s(o?.title, String(j)))
                setValues((prev) => {
                  const curr = Array.isArray(prev[name]) ? prev[name] : []
                  return {
                    ...prev,
                    [name]: e.target.checked ? [...curr, v] : curr.filter((x: string) => x !== v),
                  }
                })
              }}
              className="h-5 w-5 accent-primary-400"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function renderDropdown(
  comp: FlowComponent,
  idx: number,
  values: Record<string, any>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  dataExamples: Record<string, unknown>,
  resolveText: (text: string) => string,
  editorKey?: string | null,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
  onEditKey?: (key: string) => void,
) {
  const label = resolveText((s(comp.label, '') || 'Select').trim())
  const options = getOptions(comp, dataExamples)
  const name = s(comp.name, `dropdown_${idx}`)
  const value = values[name] ?? ''
  const selected = !!editorKey && !!selectedKey && editorKey === selectedKey
  // #region agent log
  try {
    const ds = (comp as any)?.['data-source']
    const dsType = Array.isArray(ds) ? 'array' : typeof ds
    const dsCount = Array.isArray(ds) ? ds.length : null
  } catch {}
  // #endregion agent log
  return (
    <div key={`dd_${idx}`} className="space-y-2">
      <div
        className={`text-[14px] text-slate-200 ${editorKey ? 'cursor-pointer' : ''} ${
          selected ? 'ring-2 ring-primary-400/40 bg-primary-500/5 rounded px-1' : ''
        }`}
        onClick={() => {
          if (editorKey && onSelectKey) onSelectKey(editorKey)
          if (editorKey && onEditKey) onEditKey(editorKey)
        }}
      >
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
        className="h-12 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-4 text-[15px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
      >
        <option value="" disabled>
          Selecionar opção
        </option>
        {(options.length ? options : [{ id: 'opcao_1', title: 'Opção 1' }]).map((o: any, j: number) => (
          <option key={`dd_${idx}_${j}`} value={s(o?.id, s(o?.title, String(j)))}>
            {resolveText(s(o?.title, 'Opção'))}
          </option>
        ))}
      </select>
    </div>
  )
}

function renderDatePicker(
  comp: FlowComponent,
  idx: number,
  values: Record<string, any>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  resolveText: (text: string) => string,
  editorKey?: string | null,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
  onEditKey?: (key: string) => void,
) {
  const label = resolveText((s(comp.label, '') || 'Date').trim())
  const name = s(comp.name, `date_${idx}`)
  const value = values[name] ?? ''
  const selected = !!editorKey && !!selectedKey && editorKey === selectedKey
  return (
    <div key={`dp_${idx}`} className="space-y-2">
      <div
        className={`text-[14px] text-slate-200 ${editorKey ? 'cursor-pointer' : ''} ${
          selected ? 'ring-2 ring-primary-400/40 bg-primary-500/5 rounded px-1' : ''
        }`}
        onClick={() => {
          if (editorKey && onSelectKey) onSelectKey(editorKey)
          if (editorKey && onEditKey) onEditKey(editorKey)
        }}
      >
        {label}
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
        className="h-12 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-4 text-[15px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
      />
    </div>
  )
}

function renderComponent(
  comp: FlowComponent,
  idx: number,
  values: Record<string, any>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  dataExamples: Record<string, unknown>,
  resolveText: (text: string) => string,
  onEditKey?: (key: string) => void,
  onContextMenuKey?: (e: React.MouseEvent, key: string) => void,
  selectedKey?: string | null,
  onSelectKey?: (key: string) => void,
) {
  const type = s(comp?.type, '')
  const editorKey = getEditorKey(comp)

  if (type === 'BasicText' || type === 'TextBody' || type === 'RichText') {
    return renderBasicText(s(comp.text, ''), idx, resolveText, editorKey, selectedKey, onSelectKey, onEditKey, onContextMenuKey)
  }
  if (type === 'TextHeading') {
    return renderBasicText(s(comp.text, ''), idx, resolveText, editorKey, selectedKey, onSelectKey, onEditKey, onContextMenuKey)
  }
  if (type === 'TextSubheading') {
    return renderBasicText(s(comp.text, ''), idx, resolveText, editorKey, selectedKey, onSelectKey, onEditKey, onContextMenuKey)
  }
  if (type === 'TextCaption') {
    return renderBasicText(s(comp.text, ''), idx, resolveText, editorKey, selectedKey, onSelectKey, onEditKey, onContextMenuKey)
  }
  if (type === 'TextArea') return renderTextArea(comp, idx, values, setValues, resolveText, editorKey, selectedKey, onSelectKey, onEditKey)
  if (type === 'TextEntry' || type === 'TextInput') {
    return renderTextEntry(comp, idx, values, setValues, resolveText, editorKey, selectedKey, onSelectKey, onEditKey)
  }
  if (type === 'OptIn') return renderOptIn(comp, idx, values, setValues, resolveText, editorKey, selectedKey, onSelectKey, onEditKey)
  if (type === 'RadioButtonsGroup') {
    return renderRadioGroup(comp, idx, values, setValues, dataExamples, resolveText, editorKey, selectedKey, onSelectKey, onEditKey)
  }
  if (type === 'CheckboxGroup') {
    return renderCheckboxGroup(comp, idx, values, setValues, dataExamples, resolveText, editorKey, selectedKey, onSelectKey, onEditKey)
  }
  if (type === 'Dropdown') return renderDropdown(comp, idx, values, setValues, dataExamples, resolveText, editorKey, selectedKey, onSelectKey, onEditKey)
  if (type === 'DatePicker' || type === 'CalendarPicker') {
    return renderDatePicker(comp, idx, values, setValues, resolveText, editorKey, selectedKey, onSelectKey, onEditKey)
  }

  return null
}

export function MetaFlowPreview(props: {
  flowJson: unknown
  className?: string
  selectedScreenId?: string | null
  selectedEditorKey?: string | null
  onSelectEditorKey?: (key: string) => void
  onEditKey?: (key: string) => void
  onScreenChange?: (screenId: string) => void
  onContextMenuKey?: (e: React.MouseEvent, key: string) => void
  /** Caminhos do editor (ramificações), sem expor JSON */
  paths?: SmartPaths
}) {
  const parsed = useMemo(() => parseFlowJson(props.flowJson), [props.flowJson])
  const screens = parsed.screens || []
  const initialScreenId = screens[0]?.id || ''
  const [currentScreenId, setCurrentScreenId] = useState(initialScreenId)
  const [screenStack, setScreenStack] = useState<string[]>([])
  const [valuesByScreen, setValuesByScreen] = useState<Record<string, Record<string, any>>>({})
  const [completed, setCompleted] = useState(false)
  const clickSeqRef = React.useRef(0)

  React.useEffect(() => {
    try {
      // #region agent log
      // #endregion agent log
    } catch {}
  }, [currentScreenId, props.selectedScreenId, screenStack.length, completed])

  React.useEffect(() => {
    // #region agent log
    try {
    } catch {}
    // #endregion agent log
    setCurrentScreenId(initialScreenId)
    setScreenStack([])
    setValuesByScreen({})
    setCompleted(false)
  }, [props.flowJson, initialScreenId])

  React.useEffect(() => {
    const selected = props.selectedScreenId ? String(props.selectedScreenId) : ''
    if (!selected) return
    if (!screens.some((s) => s?.id === selected)) return
    try {
      // #region agent log
      // #endregion agent log
    } catch {}
    setCurrentScreenId(selected)
    setScreenStack([])
    setCompleted(false)
  }, [props.selectedScreenId, screens])

  React.useEffect(() => {
    if (props.onScreenChange && currentScreenId) {
      props.onScreenChange(currentScreenId)
    }
  }, [currentScreenId, props.onScreenChange])

  const screenById = useMemo(() => {
    const map = new Map<string, FlowScreen>()
    for (const screen of screens) {
      if (screen?.id) {
        map.set(screen.id, screen)
      }
    }
    return map
  }, [screens])

  const activeScreen = screenById.get(currentScreenId) || screens[0]
  const dataExamples = useMemo(() => getDataExamples(activeScreen?.data), [activeScreen?.data])
  const resolveText = (text: string) => resolveDataBindings(text, dataExamples)
  const values = valuesByScreen[currentScreenId] || {}
  const setValues = (updater: React.SetStateAction<Record<string, any>>) => {
    setValuesByScreen((prev) => {
      const current = prev[currentScreenId] || {}
      const next = typeof updater === 'function' ? (updater as any)(current) : updater
      return { ...prev, [currentScreenId]: next }
    })
  }

  const children = activeScreen?.layout?.children || []
  const flatChildren = useMemo(() => flattenChildren(children), [children])
  const footer = getFooter(flatChildren, resolveText)
  const footerComponent = flatChildren.find((c) => c?.type === 'Footer')
  const footerAction = footerComponent?.['on-click-action'] || null
  const footerEditorKey = footerComponent ? getEditorKey(footerComponent) : null
  const footerSelected = !!footerEditorKey && !!props.selectedEditorKey && footerEditorKey === props.selectedEditorKey
  const isTerminalScreen = !!activeScreen?.terminal

  const title = resolveText((activeScreen?.title || 'MiniApp').trim() || 'MiniApp')
  const titleEditorKey = activeScreen?.editorTitleKey
  const titleSelected = !!titleEditorKey && !!props.selectedEditorKey && titleEditorKey === props.selectedEditorKey
  const canGoBack = screenStack.length > 0
  const requiredOk = flatChildren
    .filter((c) => c?.type !== 'Footer')
    .every((c, idx) => isRequiredSatisfied(c, values, idx))

  const handleGoBack = () => {
    if (!canGoBack) return
    setScreenStack((prev) => {
      const next = [...prev]
      const previousId = next.pop()
      if (previousId) {
        setCurrentScreenId(previousId)
      }
      setCompleted(false)
      return next
    })
  }

  const resolveNextByPaths = (): string | null | undefined => {
    const paths = props.paths
    if (!paths) return undefined

    const valuesForScreen = valuesByScreen[currentScreenId] || {}
    const rules = paths.branchesByScreen?.[currentScreenId] || []

    const isFilled = (v: unknown) => {
      if (v === null || v === undefined) return false
      if (typeof v === 'string') return v.trim().length > 0
      if (typeof v === 'number') return true
      if (typeof v === 'boolean') return true
      if (Array.isArray(v)) return v.length > 0
      return true
    }

    const toNumber = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null
      if (typeof v === 'string') {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      return null
    }

    const toDateMs = (v: unknown): number | null => {
      if (typeof v === 'string') {
        const ms = Date.parse(v)
        return Number.isFinite(ms) ? ms : null
      }
      return null
    }

    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

    const equals = (a: unknown, b: unknown) => {
      // UX: comparar de forma tolerante (CheckboxGroup retorna array; opções muitas vezes são ids em minúsculo).
      if (Array.isArray(a)) return a.some((x) => norm(x) === norm(b))
      return norm(a) === norm(b)
    }

    const contains = (a: unknown, b: unknown) => {
      if (typeof a === 'string') return a.toLowerCase().includes(String(b ?? '').toLowerCase())
      if (Array.isArray(a)) return a.some((x) => String(x ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()))
      return false
    }

    const matches = (rule: SmartPathsRule): boolean => {
      const v = (valuesForScreen as any)[rule.field]
      const op = String(rule.op || '').toLowerCase()
      if (op === 'is_filled') return isFilled(v)
      if (op === 'is_empty') return !isFilled(v)
      if (op === 'is_true') return v === true || String(v ?? '').toLowerCase() === 'true'
      if (op === 'is_false') return v === false || String(v ?? '').toLowerCase() === 'false'
      if (op === 'equals') return equals(v, rule.value)
      if (op === 'contains') return contains(v, rule.value)
      if (op === 'gt' || op === 'lt') {
        const an = toNumber(v)
        const bn = toNumber(rule.value)
        if (an !== null && bn !== null) return op === 'gt' ? an > bn : an < bn
        const ad = toDateMs(v)
        const bd = toDateMs(rule.value)
        if (ad !== null && bd !== null) return op === 'gt' ? ad > bd : ad < bd
        return false
      }
      return false
    }

    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') continue
      if (!rule.field) continue
      if (matches(rule)) return rule.next ?? null
    }

    const fallback = paths.defaultNextByScreen?.[currentScreenId]
    return typeof fallback === 'string' && fallback ? fallback : fallback === null ? null : undefined
  }

  const resolveNextScreen = () => {
    const byPaths = resolveNextByPaths()
    if (byPaths !== undefined) return byPaths
    const next = footerAction?.next
    if (next && typeof next === 'object' && (next as any).type === 'screen' && (next as any).name) {
      return String((next as any).name)
    }
    const payload = footerAction?.payload || {}
    if (payload?.screen) return String(payload.screen)
    const routingModel = parsed.routingModel || {}
    const routes = routingModel[currentScreenId] || []
    return routes.length ? routes[0] : null
  }

  const handleFooterClick = () => {
    const clickId = ++clickSeqRef.current
    if (!requiredOk) return
    const actionName = String(footerAction?.name || '').toLowerCase()
    if (actionName === 'complete' || isTerminalScreen) {
      setCompleted(true)
      return
    }
    try {
      if (props.paths) {
        const valuesForScreen = valuesByScreen[currentScreenId] || {}
        const rules = props.paths.branchesByScreen?.[currentScreenId] || []
        const byPaths = resolveNextByPaths()
        // #region agent log
        // #endregion agent log
      }
    } catch {}
    const nextId = resolveNextScreen()
    if (nextId === null) {
      setCompleted(true)
      return
    }
    if (!nextId) return
    if (!screens.some((s) => s?.id === nextId)) return
    try {
      // #region agent log
      // #endregion agent log
    } catch {}
    setScreenStack((prev) => [...prev, currentScreenId])
    setCurrentScreenId(nextId)
    setCompleted(false)
  }

  return (
    <div className={`relative mx-auto w-[320px] h-160 rounded-[2.2rem] bg-slate-950 border-8 border-slate-900 shadow-2xl overflow-hidden ${props.className || ''}`}>
      {/* topo do "telefone" */}
      <div className="h-10 bg-slate-950" />

      {/* modal do flow (como no WhatsApp) */}
      <div className="absolute inset-x-0 top-6 bottom-0 rounded-t-2xl bg-[#1f2223] border-t border-[var(--ds-border-subtle)] overflow-hidden">
        {/* topbar */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--ds-border-subtle)]">
          <button
            type="button"
            aria-label={canGoBack ? 'Voltar' : 'Fechar preview da MiniApp'}
            title={canGoBack ? 'Voltar' : 'Fechar'}
            className="h-9 w-9 rounded-full hover:bg-[var(--ds-bg-hover)] flex items-center justify-center text-slate-200"
            onClick={handleGoBack}
          >
            {canGoBack ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </button>
          <div
            className={`text-[18px] font-semibold text-slate-100 truncate ${
              titleEditorKey ? 'cursor-pointer hover:bg-[var(--ds-bg-hover)] px-1 rounded transition-colors' : ''
            } ${titleSelected ? 'ring-2 ring-primary-400/40 bg-primary-500/5 rounded px-1' : ''}`}
            onClick={() => {
              if (titleEditorKey && props.onSelectEditorKey) props.onSelectEditorKey(titleEditorKey)
              if (titleEditorKey && props.onEditKey) props.onEditKey(titleEditorKey)
            }}
          >
            {title}
          </div>
          <button
            type="button"
            aria-label="Mais opções do preview"
            title="Mais opções"
            className="h-9 w-9 rounded-full hover:bg-[var(--ds-bg-hover)] flex items-center justify-center text-slate-200"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>

        {/* conteúdo */}
        <div className="px-5 py-5 space-y-6 overflow-auto" style={{ height: 'calc(100% - 14rem)' }}>
          {flatChildren
            .filter((c) => c?.type !== 'Footer')
            .map((c, idx) =>
              renderComponent(
                c,
                idx,
                values,
                setValues,
                dataExamples,
                resolveText,
                props.onEditKey,
                props.onContextMenuKey,
                props.selectedEditorKey,
                props.onSelectEditorKey,
              ),
            )}
        </div>

        {/* CTA + compliance */}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-6 pt-4 bg-linear-to-t from-[#1f2223] via-[#1f2223] to-transparent">
          <button
            type="button"
            disabled={!requiredOk || completed}
            onClick={handleFooterClick}
            onContextMenu={(e) => {
              if (!footerEditorKey || !props.onSelectEditorKey) return
              e.preventDefault()
              props.onSelectEditorKey(footerEditorKey)
            }}
            className={`w-full h-12 rounded-2xl bg-primary-500/80 text-white text-[16px] font-semibold hover:bg-primary-400/90 disabled:bg-[var(--ds-bg-hover)] disabled:text-white/40 disabled:cursor-not-allowed ${
              footerSelected ? 'ring-2 ring-primary-300/60' : ''
            }`}
          >
            {completed ? 'Concluído' : footer.label}
          </button>

          <div className="mt-4 text-center text-[14px] text-slate-400">
            Gerenciada pela empresa. <span className="text-primary-400">Saiba mais</span>
          </div>
          <div className="mt-1 text-center text-[10px] text-slate-500">preview Meta • v{parsed.version || '—'}</div>
        </div>
      </div>
    </div>
  )
}

export default MetaFlowPreview
