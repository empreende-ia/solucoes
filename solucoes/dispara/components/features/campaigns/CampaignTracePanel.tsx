import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Copy, Loader2, RefreshCw, Search } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Container } from '@/components/ui/container'
import { StatusBadge } from '@/components/ui/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { campaignService } from '@/services/campaignService'

type TraceListItem = {
  traceId: string
  source: 'run_metrics' | 'campaign_contacts'
  createdAt?: string | null
  lastSeenAt?: string | null
  recipients?: number | null
  sentTotal?: number | null
  failedTotal?: number | null
  skippedTotal?: number | null
}

type TraceEventRow = {
  id: string
  trace_id: string
  ts: string
  step: string | null
  phase: string
  ok: boolean | null
  ms: number | null
  batch_index: number | null
  contact_id: string | null
  phone_masked: string | null
  extra: Record<string, unknown> | null
}

function fmtIso(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return String(iso)
  }
}

function fmtMs(ms: number | null | undefined): string {
  if (!Number.isFinite(ms as number) || (ms as number) <= 0) return '—'
  const v = ms as number
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`
}

export function CampaignTracePanel({
  campaignId,
  initialTraceId,
}: {
  campaignId: string
  initialTraceId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [traces, setTraces] = useState<TraceListItem[]>([])
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [showAllTraces, setShowAllTraces] = useState(false)

  const [events, setEvents] = useState<TraceEventRow[]>([])
  const [eventsTotal, setEventsTotal] = useState<number | null>(null)
  const [eventsOffset, setEventsOffset] = useState(0)

  const [traceSearch, setTraceSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState<string>('')
  const [okFilter, setOkFilter] = useState<'all' | 'ok' | 'fail'>('all')

  const [isLoadingTraces, setIsLoadingTraces] = useState(false)
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredTraces = useMemo(() => {
    const q = traceSearch.trim().toLowerCase()
    if (!q) return traces
    return traces.filter((t) => t.traceId.toLowerCase().includes(q))
  }, [traceSearch, traces])

  const loadTraces = useCallback(async () => {
    setIsLoadingTraces(true)
    setError(null)
    try {
      const { traces: fetchedTraces } = await campaignService.getTraces(campaignId, 50)
      const list = fetchedTraces as TraceListItem[]
      setTraces(list)

      // Auto-select SEMPRE:
      // - Preferimos o traceId vindo das metricas (quando presente).
      // - Caso contrario, usamos a execucao mais recente retornada pelo endpoint.
      // - Mantemos a selecao atual apenas se ela ainda existir no conjunto.
      const current = selectedTraceId
      const currentExists = current && list.some((t) => t.traceId === current)
      const preferred = String(initialTraceId || '').trim()
      const preferredExists = preferred && list.some((t) => t.traceId === preferred)
      const next = preferredExists ? preferred : (list[0]?.traceId || null)

      if (!currentExists) {
        setSelectedTraceId(next)
        setEvents([])
        setEventsOffset(0)
        setEventsTotal(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoadingTraces(false)
    }
  }, [campaignId, initialTraceId, selectedTraceId])

  const loadEvents = useCallback(async (opts?: { reset?: boolean }) => {
    if (!selectedTraceId) return
    const reset = opts?.reset ?? false
    const nextOffset = reset ? 0 : eventsOffset

    setIsLoadingEvents(true)
    setError(null)
    try {
      const { events: fetchedEvents, pagination } = await campaignService.getTraceEvents(campaignId, {
        traceId: selectedTraceId,
        limit: 200,
        offset: nextOffset,
        phase: phaseFilter.trim() || undefined,
        ok: okFilter,
      })

      const rows = fetchedEvents as TraceEventRow[]
      const total = pagination.total

      setEventsTotal(total)
      if (reset) {
        setEvents(rows)
        setEventsOffset(rows.length)
      } else {
        setEvents((prev) => [...prev, ...rows])
        setEventsOffset((prev) => prev + rows.length)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoadingEvents(false)
    }
  }, [campaignId, eventsOffset, okFilter, phaseFilter, selectedTraceId])

  useEffect(() => {
    if (!open) return
    void loadTraces()
  }, [open, loadTraces])

  useEffect(() => {
    if (!open) return
    if (!selectedTraceId) return
    // quando troca trace ou filtros, reseta paginação
    void loadEvents({ reset: true })
  }, [open, selectedTraceId, phaseFilter, okFilter, loadEvents])

  const selected = useMemo(() => traces.find((t) => t.traceId === selectedTraceId) || null, [traces, selectedTraceId])
  const hasMore = useMemo(() => {
    if (eventsTotal == null) return events.length > 0 && events.length % 200 === 0
    return events.length < eventsTotal
  }, [events.length, eventsTotal])

  const shouldShowTracesList = showAllTraces || traces.length > 1

  return (
    <Container variant="glass" padding="lg" className="mt-4">
    <Collapsible
      open={open}
      onOpenChange={setOpen}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-start justify-between gap-4 text-left"
          aria-label={open ? 'Recolher debug de execuções' : 'Expandir debug de execuções'}
        >
          <div>
            <h3 className="text-[var(--ds-text-primary)] font-bold">Debug • Execuções (Trace)</h3>
            <p className="text-xs text-[var(--ds-text-muted)]">
              Responde rápido "disparou?" e "travou onde?" via timeline por <span className="font-mono">trace_id</span>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedTraceId ? (
              <StatusBadge status="success" size="sm">
                trace: {selectedTraceId.slice(0, 10)}…
              </StatusBadge>
            ) : (
              <StatusBadge status="default" size="sm">
                sem trace
              </StatusBadge>
            )}

            <ChevronDown
              size={16}
              className={`text-[var(--ds-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-lg px-3 py-2 focus-within:border-primary-500/50 transition-all">
              <Search size={14} className="text-[var(--ds-text-muted)]" />
              <input
                type="text"
                value={traceSearch}
                onChange={(e) => setTraceSearch(e.target.value)}
                placeholder="Buscar trace_id…"
                className="bg-transparent border-none outline-none text-sm w-full text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)]"
              />
            </div>

            {traces.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAllTraces((v) => !v)}
                className="px-3 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-xs font-medium"
                title={showAllTraces ? 'Ocultar lista de execuções' : 'Mostrar lista de execuções'}
              >
                {showAllTraces ? 'Ocultar execuções' : 'Ver execuções'}
              </button>
            )}

            <button
              type="button"
              onClick={() => void loadTraces()}
              disabled={isLoadingTraces}
              className="px-3 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-xs font-medium disabled:opacity-50"
            >
              {isLoadingTraces ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
          </div>

          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {shouldShowTracesList ? (
              <Container variant="default" padding="none" className="lg:col-span-1 overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--ds-border-subtle)] text-xs text-[var(--ds-text-secondary)] flex items-center justify-between">
                <span>Execuções</span>
                <span className="font-mono">{filteredTraces.length}</span>
              </div>

              <div className="max-h-[320px] overflow-y-auto">
                {isLoadingTraces ? (
                  <div className="p-4 text-xs text-[var(--ds-text-muted)] flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Carregando…
                  </div>
                ) : filteredTraces.length === 0 ? (
                  <div className="p-4 text-xs text-[var(--ds-text-muted)]">
                    Nenhuma execução encontrada. Se você acabou de disparar, aguarde alguns segundos.
                  </div>
                ) : (
                  filteredTraces.map((t) => {
                    const active = t.traceId === selectedTraceId
                    return (
                      <button
                        key={t.traceId}
                        type="button"
                        onClick={() => {
                          setSelectedTraceId(t.traceId)
                          setEvents([])
                          setEventsOffset(0)
                          setEventsTotal(null)
                        }}
                        className={`w-full text-left px-3 py-2 border-b border-[var(--ds-border-subtle)] hover:bg-[var(--ds-bg-hover)] transition-colors ${
                          active ? 'bg-[var(--ds-bg-hover)]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs text-[var(--ds-text-primary)] font-mono truncate">{t.traceId}</div>
                            <div className="text-[11px] text-[var(--ds-text-muted)] mt-0.5">
                              {t.source === 'run_metrics' ? 'run_metrics' : 'contacts'} • last: {fmtIso(t.lastSeenAt || t.createdAt || null)}
                            </div>
                          </div>
                          {t.source === 'run_metrics' && (
                            <div className="text-[10px] text-[var(--ds-text-muted)] text-right shrink-0">
                              <div className="font-mono">
                                {typeof t.sentTotal === 'number' ? t.sentTotal : '—'} sent
                              </div>
                              <div className="font-mono">
                                {typeof t.failedTotal === 'number' ? t.failedTotal : '—'} fail
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
              </Container>
            ) : null}

            <Container variant="default" padding="none" className={`${shouldShowTracesList ? 'lg:col-span-2' : 'lg:col-span-3'} overflow-hidden`}>
              <div className="px-3 py-2 border-b border-[var(--ds-border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-[var(--ds-text-secondary)]">
                  Timeline{' '}
                  {eventsTotal != null ? (
                    <span className="ml-1 font-mono text-[var(--ds-text-secondary)]">
                      {events.length}/{eventsTotal}
                    </span>
                  ) : (
                    <span className="ml-1 font-mono text-[var(--ds-text-muted)]">{events.length}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={okFilter}
                    onChange={(e) => setOkFilter(e.target.value as any)}
                    className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-md px-2 py-1 text-xs text-[var(--ds-text-primary)]"
                    title="Filtro de sucesso/erro"
                  >
                    <option value="all">Todos</option>
                    <option value="ok">OK</option>
                    <option value="fail">Erros</option>
                  </select>

                  <input
                    value={phaseFilter}
                    onChange={(e) => setPhaseFilter(e.target.value)}
                    placeholder="phase (ex: batch_end)"
                    className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-md px-2 py-1 text-xs text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)] w-[180px]"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedTraceId) return
                      void navigator.clipboard?.writeText(selectedTraceId)
                    }}
                    disabled={!selectedTraceId}
                    className="px-2 py-1 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-md text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-xs disabled:opacity-50"
                    title="Copiar trace_id"
                  >
                    <Copy size={14} /> Copiar
                  </button>

                  <button
                    type="button"
                    onClick={() => void loadEvents({ reset: true })}
                    disabled={!selectedTraceId || isLoadingEvents}
                    className="px-2 py-1 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-md text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-xs disabled:opacity-50"
                    title="Atualizar timeline"
                  >
                    {isLoadingEvents ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Atualizar
                  </button>
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto divide-y divide-[var(--ds-border-subtle)]">
                {!selectedTraceId ? (
                  <div className="p-4 text-xs text-[var(--ds-text-muted)]">Selecione uma execução para ver a timeline.</div>
                ) : isLoadingEvents && events.length === 0 ? (
                  <div className="p-4 text-xs text-[var(--ds-text-muted)] flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Carregando timeline…
                  </div>
                ) : events.length === 0 ? (
                  <div className="p-4 text-xs text-[var(--ds-text-muted)]">
                    Sem eventos. Se você acabou de habilitar a migration, aplique-a no Supabase e rode um novo envio.
                  </div>
                ) : (
                  events.map((ev) => {
                    const ok = ev.ok
                    const tone =
                      ok === false
                        ? 'text-red-300'
                        : ok === true
                          ? 'text-primary-200'
                          : 'text-[var(--ds-text-secondary)]'

                    return (
                      <div key={ev.id} className="p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div className="min-w-0">
                            <div className="text-xs">
                              <span className={`font-mono ${tone}`}>{ev.phase}</span>
                              {ev.step ? <span className="text-[var(--ds-text-muted)]"> • {ev.step}</span> : null}
                              {typeof ev.batch_index === 'number' ? (
                                <span className="text-[var(--ds-text-muted)]"> • batch {ev.batch_index}</span>
                              ) : null}
                              {ev.contact_id ? (
                                <span className="text-[var(--ds-text-muted)]"> • contact {String(ev.contact_id).slice(0, 8)}…</span>
                              ) : null}
                            </div>
                            <div className="text-[11px] text-[var(--ds-text-muted)] mt-0.5">
                              {fmtIso(ev.ts)} • {fmtMs(ev.ms)}
                              {ev.phone_masked ? <span> • {ev.phone_masked}</span> : null}
                            </div>
                          </div>
                        </div>

                        {ev.ok === false && ev.extra && (ev.extra as any).error ? (
                          <div className="mt-2 text-xs text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg p-2 font-mono whitespace-pre-wrap">
                            {String((ev.extra as any).error)}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>

              {selectedTraceId && events.length > 0 && hasMore && (
                <div className="p-3 border-t border-[var(--ds-border-subtle)]">
                  <button
                    type="button"
                    onClick={() => void loadEvents({ reset: false })}
                    disabled={isLoadingEvents}
                    className="w-full px-3 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center justify-center gap-2 text-xs font-medium disabled:opacity-50"
                  >
                    {isLoadingEvents ? <Loader2 size={14} className="animate-spin" /> : null}
                    Carregar mais
                  </button>
                </div>
              )}

              {selected && (
                <div className="px-3 py-2 border-t border-[var(--ds-border-subtle)] text-[11px] text-[var(--ds-text-muted)]">
                  Fonte: <span className="font-mono text-[var(--ds-text-secondary)]">{selected.source}</span>
                  {selected.createdAt ? (
                    <span>
                      {' '}
                      • created: <span className="font-mono text-[var(--ds-text-secondary)]">{fmtIso(selected.createdAt)}</span>
                    </span>
                  ) : null}
                </div>
              )}
            </Container>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
    </Container>
  )
}

