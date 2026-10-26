'use client'

import React, { useMemo } from 'react'

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import type { DynamicFlowSpecV1 } from '@/lib/dynamic-flow'

type ParsedEditorKey =
  | { kind: 'screen_title'; screenId: string }
  | { kind: 'cta'; screenId: string }
  | { kind: 'component_text'; screenId: string; builderId: string }
  | { kind: 'component_label'; screenId: string; builderId: string }
  | { kind: 'unknown' }

function parseEditorKey(key: string | null | undefined): ParsedEditorKey {
  if (!key) return { kind: 'unknown' }
  if (!key.startsWith('screen:')) return { kind: 'unknown' }
  const parts = key.split(':')
  const screenId = parts[1]
  const p2 = parts[2]
  const p3 = parts[3]
  if (!screenId) return { kind: 'unknown' }
  if (p2 === 'title') return { kind: 'screen_title', screenId }
  if (p2 === 'cta') return { kind: 'cta', screenId }
  if (p2 && p3 === 'text') return { kind: 'component_text', screenId, builderId: p2 }
  if (p2 && p3 === 'label') return { kind: 'component_label', screenId, builderId: p2 }
  return { kind: 'unknown' }
}

function findComponentByBuilderId(components: any[], builderId: string): any | null {
  const walk = (nodes: any[]): any | null => {
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue
      if (String((n as any).__builder_id || '') === builderId) return n
      const children = Array.isArray((n as any).children) ? ((n as any).children as any[]) : null
      if (children?.length) {
        const found = walk(children)
        if (found) return found
      }
    }
    return null
  }
  return walk(Array.isArray(components) ? components : [])
}

function findComponentByName(components: any[], name: string): any | null {
  const walk = (nodes: any[]): any | null => {
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue
      if (String((n as any).name || '') === name) return n
      const children = Array.isArray((n as any).children) ? ((n as any).children as any[]) : null
      if (children?.length) {
        const found = walk(children)
        if (found) return found
      }
    }
    return null
  }
  return walk(Array.isArray(components) ? components : [])
}

export function InspectorPanel(props: {
  spec: DynamicFlowSpecV1
  selectedEditorKey: string | null
  onUpdateScreenTitle: (screenId: string, title: string) => void
  onUpdateCta: (screenId: string, patch: { label?: string; nextScreenId?: string }) => void
  onUpdateComponent: (screenId: string, builderId: string, patch: { text?: string; label?: string }) => void
  onUpdateBookingServices?: (services: Array<{ id: string; title: string }>) => void
  onUpdateBookingDateComponent?: (mode: 'calendar' | 'dropdown') => void
}) {
  React.useEffect(() => {
    // #region agent log
    // #endregion
  }, [props.selectedEditorKey, props.spec])
  const parsed = useMemo(() => parseEditorKey(props.selectedEditorKey), [props.selectedEditorKey])
  const screen = useMemo(() => props.spec.screens.find((s) => s.id === (parsed as any).screenId), [parsed, props.spec.screens])

  const component =
    parsed.kind === 'component_text' || parsed.kind === 'component_label'
      ? findComponentByBuilderId(screen?.components as any, parsed.builderId)
      : null

  const nextScreenId = screen ? (props.spec.routingModel?.[screen.id]?.[0] || '') : ''

  const bookingStart = useMemo(() => props.spec.screens.find((s) => s.id === 'BOOKING_START'), [props.spec.screens])
  const isBooking = !!bookingStart
  const bookingServices = useMemo(() => {
    if (Array.isArray((props.spec as any).services)) return (props.spec as any).services as Array<{ id: string; title: string }>
    const ex = (bookingStart as any)?.data?.services?.__example__
    return Array.isArray(ex) ? (ex as Array<{ id: string; title: string }>) : []
  }, [bookingStart, props.spec])
  const bookingDateComponent = useMemo(() => {
    const explicit = (props.spec as any).dateComponent
    if (explicit === 'calendar' || explicit === 'dropdown') return explicit
    const selectedDate = bookingStart ? findComponentByName((bookingStart as any).components, 'selected_date') : null
    const t = String(selectedDate?.type || '').toLowerCase()
    return t === 'dropdown' ? 'dropdown' : 'calendar'
  }, [bookingStart, props.spec])

  if (!props.selectedEditorKey) {
    return (
      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4">
        <div className="text-sm font-semibold text-white">Editar</div>
        <div className="text-xs text-slate-400 mt-1">Clique em um texto, pergunta ou botão no preview para editar.</div>
        {isBooking ? (
          <details className="mt-4 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-white">Assistente: Agendamento</summary>
            <div className="mt-3 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Serviços</div>
                <div className="space-y-2">
                  {bookingServices.map((s, idx) => (
                    <div key={`service_${idx}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                      <Input
                        value={s.id}
                        onChange={(e) => {
                          // #region agent log
                          // #endregion
                          const next = [...bookingServices]
                          next[idx] = { ...next[idx], id: e.target.value }
                          props.onUpdateBookingServices?.(next)
                        }}
                        onFocus={() => {
                          // #region agent log
                          // #endregion
                        }}
                        onBlur={() => {
                          // #region agent log
                          // #endregion
                        }}
                        placeholder="id"
                        className="font-mono text-xs"
                      />
                      <Input
                        value={s.title}
                        onChange={(e) => {
                          // #region agent log
                          // #endregion
                          const next = [...bookingServices]
                          next[idx] = { ...next[idx], title: e.target.value }
                          props.onUpdateBookingServices?.(next)
                        }}
                        onFocus={() => {
                          // #region agent log
                          // #endregion
                        }}
                        onBlur={() => {
                          // #region agent log
                          // #endregion
                        }}
                        placeholder="Título"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)]"
                        onClick={() => {
                          const next = bookingServices.filter((_, i) => i !== idx)
                          props.onUpdateBookingServices?.(next)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] text-slate-200 hover:text-white hover:bg-[var(--ds-bg-hover)]"
                    onClick={() => {
                      const n = bookingServices.length + 1
                      props.onUpdateBookingServices?.([...bookingServices, { id: `servico_${n}`, title: `Serviço ${n}` }])
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar serviço
                  </Button>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Escolha de data</div>
                <select
                  value={bookingDateComponent}
                  onChange={(e) => props.onUpdateBookingDateComponent?.(e.target.value === 'dropdown' ? 'dropdown' : 'calendar')}
                  className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                >
                  <option value="calendar">Calendário</option>
                  <option value="dropdown">Lista (dropdown)</option>
                </select>
              </div>
            </div>
          </details>
        ) : null}
      </div>
    )
  }

  if (!screen || parsed.kind === 'unknown') {
    return (
      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4">
        <div className="text-sm font-semibold text-white">Editar</div>
        <div className="text-xs text-slate-400 mt-1">Seleção não reconhecida. Selecione um elemento do preview.</div>
      </div>
    )
  }

  if (parsed.kind === 'screen_title') {
    return (
      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-3">
        <div className="text-sm font-semibold text-white">Título da tela</div>
        <Input value={screen.title} onChange={(e) => props.onUpdateScreenTitle(screen.id, e.target.value)} />
      </div>
    )
  }

  if (parsed.kind === 'cta') {
    return (
      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-3">
        <div className="text-sm font-semibold text-white">Botão</div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Texto</label>
          <Input value={String((screen as any)?.action?.label || '')} onChange={(e) => props.onUpdateCta(screen.id, { label: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Ir para</label>
          <select
            value={nextScreenId}
            onChange={(e) => props.onUpdateCta(screen.id, { nextScreenId: e.target.value })}
            className="h-11 w-full rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-hover)] px-3 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
          >
            <option value="">— Concluir —</option>
            {props.spec.screens
              .filter((s) => s.id !== screen.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || s.id}
                </option>
              ))}
          </select>
        </div>
      </div>
    )
  }

  if ((parsed.kind === 'component_text' || parsed.kind === 'component_label') && !component) {
    return (
      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4">
        <div className="text-sm font-semibold text-white">Editar</div>
        <div className="text-xs text-slate-400 mt-1">Não achei esse elemento no fluxo. Selecione novamente no preview.</div>
      </div>
    )
  }

  if (parsed.kind === 'component_text') {
    return (
      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-3">
        <div className="text-sm font-semibold text-white">Texto</div>
        <Textarea
          value={String(component?.text || '')}
          onChange={(e) => props.onUpdateComponent(screen.id, parsed.builderId, { text: e.target.value })}
        />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 space-y-3">
      <div className="text-sm font-semibold text-white">Pergunta</div>
      <Input
        value={String(component?.label || '')}
        onChange={(e) => props.onUpdateComponent(screen.id, (parsed as any).builderId, { label: e.target.value })}
      />
    </div>
  )
}

