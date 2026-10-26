'use client'

import React, { useMemo } from 'react'
import { ChevronLeft, X } from 'lucide-react'

type FlowComponent = Record<string, any>

type ParsedFlow = {
  version?: string
  screen?: {
    id?: string
    title?: string
    terminal?: boolean
    layout?: {
      type?: string
      children?: FlowComponent[]
    }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function parseFlowJson(flowJson: unknown): ParsedFlow {
  if (!isPlainObject(flowJson)) return {}

  const screens = Array.isArray((flowJson as any).screens) ? (flowJson as any).screens : []
  const screen = screens[0]
  const layout = isPlainObject(screen?.layout) ? screen.layout : undefined

  return {
    version: typeof (flowJson as any).version === 'string' ? (flowJson as any).version : undefined,
    screen: isPlainObject(screen)
      ? {
          id: typeof screen.id === 'string' ? screen.id : undefined,
          title: typeof screen.title === 'string' ? screen.title : undefined,
          terminal: typeof screen.terminal === 'boolean' ? screen.terminal : undefined,
          layout: layout
            ? {
                type: typeof (layout as any).type === 'string' ? (layout as any).type : undefined,
                children: Array.isArray((layout as any).children) ? (layout as any).children : [],
              }
            : undefined,
        }
      : undefined,
  }
}

function clampText(v: unknown, fallback = ''): string {
  return (typeof v === 'string' ? v : fallback).toString()
}

function getFooter(children: FlowComponent[]): { label: string } | null {
  const footer = children.find((c) => c && c.type === 'Footer')
  if (!footer) return null
  const raw = clampText(footer.label, 'Continuar')
  return { label: raw || 'Continuar' }
}

function renderComponent(comp: FlowComponent, idx: number) {
  const type = clampText(comp?.type, '')

  if (type === 'BasicText') {
    const text = clampText(comp.text, '')
    if (!text) return null
    return (
      <div key={`bt_${idx}`} className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap">
        {text}
      </div>
    )
  }

  if (type === 'TextEntry') {
    const label = clampText(comp.label, 'Campo')
    const required = !!comp.required
    return (
      <div key={`te_${idx}`} className="space-y-1">
        <div className="text-[12px] font-medium text-slate-800">
          {label}{required ? <span className="text-red-600"> *</span> : null}
        </div>
        <div className="h-9 rounded-lg border border-slate-200 bg-white px-3 flex items-center text-[12px] text-slate-400">
          Digite aqui…
        </div>
      </div>
    )
  }

  if (type === 'DatePicker') {
    const label = clampText(comp.label, 'Data')
    const required = !!comp.required
    return (
      <div key={`dp_${idx}`} className="space-y-1">
        <div className="text-[12px] font-medium text-slate-800">
          {label}{required ? <span className="text-red-600"> *</span> : null}
        </div>
        <div className="h-9 rounded-lg border border-slate-200 bg-white px-3 flex items-center justify-between text-[12px] text-slate-400">
          <span>dd/mm/aaaa</span>
          <span className="text-[11px]">📅</span>
        </div>
      </div>
    )
  }

  if (type === 'Dropdown') {
    const label = clampText(comp.label, 'Selecione')
    const required = !!comp.required
    const options = Array.isArray(comp.options) ? comp.options : []
    return (
      <div key={`dd_${idx}`} className="space-y-1">
        <div className="text-[12px] font-medium text-slate-800">
          {label}{required ? <span className="text-red-600"> *</span> : null}
        </div>
        <div className="h-9 rounded-lg border border-slate-200 bg-white px-3 flex items-center justify-between text-[12px] text-slate-500">
          <span>Selecione…</span>
          <span className="text-[11px]">▾</span>
        </div>
        {options.length > 0 ? (
          <div className="text-[11px] text-slate-400">{options.length} opções</div>
        ) : null}
      </div>
    )
  }

  if (type === 'RadioButtonsGroup') {
    const label = clampText(comp.label, 'Escolha uma opção')
    const required = !!comp.required
    const options = Array.isArray(comp.options) ? comp.options : []
    return (
      <div key={`rg_${idx}`} className="space-y-1">
        <div className="text-[12px] font-medium text-slate-800">
          {label}{required ? <span className="text-red-600"> *</span> : null}
        </div>
        <div className="space-y-2">
          {(options.length ? options.slice(0, 3) : [{ id: 'a', title: 'Opção 1' }]).map((o: any, j: number) => (
            <div key={`rg_${idx}_${j}`} className="flex items-center gap-2 text-[12px] text-slate-700">
              <div className="h-4 w-4 rounded-full border border-slate-300 bg-white" />
              <div className="truncate">{clampText(o.title, 'Opção')}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'CheckboxGroup') {
    const label = clampText(comp.label, 'Selecione uma ou mais')
    const required = !!comp.required
    const options = Array.isArray(comp.options) ? comp.options : []
    return (
      <div key={`cg_${idx}`} className="space-y-1">
        <div className="text-[12px] font-medium text-slate-800">
          {label}{required ? <span className="text-red-600"> *</span> : null}
        </div>
        <div className="space-y-2">
          {(options.length ? options.slice(0, 3) : [{ id: 'a', title: 'Opção 1' }]).map((o: any, j: number) => (
            <div key={`cg_${idx}_${j}`} className="flex items-center gap-2 text-[12px] text-slate-700">
              <div className="h-4 w-4 rounded border border-slate-300 bg-white" />
              <div className="truncate">{clampText(o.title, 'Opção')}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'OptIn') {
    const text = clampText(comp.text, 'Quero receber mensagens')
    return (
      <div key={`oi_${idx}`} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="h-4 w-4 rounded border border-slate-300 bg-white mt-0.5" />
        <div className="text-[12px] text-slate-700 leading-snug">{text}</div>
      </div>
    )
  }

  // Fallback: render “unknown component” as a subtle box (helps debugging)
  return (
    <div key={`uk_${idx}`} className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
      Componente: {type || 'desconhecido'}
    </div>
  )
}

export function FlowPhonePreview(props: {
  flowJson: unknown
  businessName?: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const parsed = useMemo(() => parseFlowJson(props.flowJson), [props.flowJson])

  const businessName = props.businessName || 'Dispara'
  const size = props.size || 'md'

  const sizeConfig =
    size === 'sm'
      ? { height: 'h-[420px]', width: 'w-[240px]', border: 'border-[6px]', notch: 'w-24 h-5' }
      : { height: 'h-[560px]', width: 'w-[320px]', border: 'border-[8px]', notch: 'w-32 h-6' }

  const title = parsed.screen?.title || 'Prévia da MiniApp'
  const children = parsed.screen?.layout?.children || []
  const footer = getFooter(children)

  return (
    <div
      className={`relative mx-auto border-slate-800 bg-slate-950 ${sizeConfig.border} rounded-[2.5rem] ${sizeConfig.height} ${sizeConfig.width} shadow-2xl flex flex-col overflow-hidden ${
        props.className || ''
      }`}
    >
      {/* Notch */}
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 ${sizeConfig.notch} bg-slate-800 rounded-b-xl z-20`} />

      {/* Top bar (Meta preview feel) */}
      <div className="bg-[#111b21] h-14 flex items-center px-3 gap-2 shrink-0 border-b border-black/30">
        <div className="h-8 w-8 rounded-full bg-[var(--ds-bg-hover)] flex items-center justify-center text-white/80">
          <ChevronLeft className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-white leading-none truncate">{businessName}</div>
          <div className="text-[10px] text-white/60 leading-none mt-0.5 truncate">MiniApp</div>
        </div>
        <div className="h-8 w-8 rounded-full bg-[var(--ds-bg-hover)] flex items-center justify-center text-white/80">
          <X className="h-4 w-4" />
        </div>
      </div>

      {/* “Webview” / Flow surface */}
      <div className="flex-1 min-h-0 bg-[#f6f7f9] p-3 overflow-auto">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="text-[14px] font-semibold text-slate-900 leading-snug truncate">{title}</div>
            {parsed.screen?.id ? (
              <div className="text-[10px] text-slate-400 mt-0.5">screen: {parsed.screen.id}</div>
            ) : null}
          </div>

          <div className="px-4 py-4 space-y-4">
            {children.filter((c) => c?.type !== 'Footer').map((c, idx) => renderComponent(c, idx))}
          </div>

          <div className="px-4 pb-4">
            <button
              type="button"
              className="w-full h-10 rounded-xl bg-[#00a884] hover:bg-[#029a78] text-white text-[13px] font-semibold"
            >
              {footer?.label || 'Continuar'}
            </button>
            <div className="mt-2 text-center text-[10px] text-slate-500">
              Gerenciada pela empresa. <span className="underline underline-offset-2">Saiba mais.</span>
            </div>
            <div className="mt-1 text-center text-[10px] text-slate-400">
              Prévia (estilo Meta) • versão {parsed.version || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom safe area */}
      <div className="bg-slate-950 h-4 shrink-0" />
    </div>
  )
}

export default FlowPhonePreview
