'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter'
import type { FlowSubmissionRow } from '@/services/flowSubmissionsService'
import type { FlowRow } from '@/services/flowsService'

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('pt-BR')
}

function safePrettyJson(raw: unknown): string {
  try {
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw)
      return JSON.stringify(parsed, null, 2)
    }
    return JSON.stringify(raw, null, 2)
  } catch {
    return typeof raw === 'string' ? raw : JSON.stringify(raw)
  }
}

export function FlowSubmissionsView(props: {
  submissions: FlowSubmissionRow[]
  isLoading: boolean
  isFetching: boolean
  phoneFilter: string
  onPhoneFilterChange: (v: string) => void
  flowIdFilter: string
  onFlowIdFilterChange: (v: string) => void
  onRefresh: () => void
  builderFlows?: FlowRow[]
  title?: string
  subtitle?: string
  showFilters?: boolean
  limit?: number
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(props.showFilters ?? true)

  const rows = useMemo(() => props.submissions || [], [props.submissions])
  const visibleRows = useMemo(() => (props.limit ? rows.slice(0, props.limit) : rows), [props.limit, rows])

  useEffect(() => {
    if (props.showFilters === undefined) return
    setFiltersOpen(props.showFilters)
  }, [props.showFilters])

  const builderByMetaFlowId = useMemo(() => {
    const out = new Map<string, FlowRow>()
    for (const f of props.builderFlows || []) {
      if (f.meta_flow_id) out.set(String(f.meta_flow_id), f)
    }
    return out
  }, [props.builderFlows])

  const builderFlowOptions = useMemo(() => {
    const rows = (props.builderFlows || []).filter((f) => !!f.meta_flow_id)
    rows.sort((a, b) => a.name.localeCompare(b.name))
    return rows
  }, [props.builderFlows])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">{props.title || 'Submissões'}</div>
            {props.subtitle ? (
              <div className="text-xs text-slate-500 mt-1">{props.subtitle}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {props.showFilters === false && (
              <Button type="button" variant="ghost" onClick={() => setFiltersOpen((prev) => !prev)}>
                {filtersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={props.onRefresh}
              disabled={props.isLoading || props.isFetching}
            >
              <RefreshCw size={16} className={props.isFetching ? 'animate-spin' : ''} />
              Atualizar
            </Button>
          </div>
        </div>

        {(props.showFilters !== false || filtersOpen) && (
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Filtrar por telefone (from_phone)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                  <Input
                    value={props.phoneFilter}
                    onChange={(e) => props.onPhoneFilterChange(e.target.value)}
                    placeholder="Ex: +5511999999999"
                    className="pl-9 bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">MiniApp (Builder)</label>
                <Select
                  value={props.flowIdFilter?.trim() ? props.flowIdFilter : '__all__'}
                  onValueChange={(v) => props.onFlowIdFilterChange(v === '__all__' ? '' : v)}
                >
                  <SelectTrigger className="w-full bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {builderFlowOptions.map((f) => (
                      <SelectItem key={f.id} value={String(f.meta_flow_id)}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Filtrar por ID da MiniApp (Meta)</label>
                <Input
                  value={props.flowIdFilter}
                  onChange={(e) => props.onFlowIdFilterChange(e.target.value)}
                  placeholder="Ex: 1234567890"
                  className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-white"
                />
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          {props.isLoading
            ? 'Carregando…'
            : props.limit
              ? `Mostrando ${visibleRows.length} de ${rows.length} registro(s)`
              : `Mostrando ${rows.length} registro(s)`}
          {props.isFetching && !props.isLoading ? ' (atualizando…)': ''}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] shadow-[0_12px_30px_rgba(0,0,0,0.35)] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--ds-bg-surface)]/30">
            <tr className="text-slate-400">
              <th className="px-4 py-3 font-semibold">Data</th>
              <th className="px-4 py-3 font-semibold">Telefone</th>
              <th className="px-4 py-3 font-semibold">MiniApp</th>
              <th className="px-4 py-3 font-semibold">Token</th>
              <th className="px-4 py-3 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma submissão encontrada.
                </td>
              </tr>
            ) : (
              visibleRows.map((r) => {
                const isOpen = openId === r.id
                const builder = r.flow_id ? builderByMetaFlowId.get(String(r.flow_id)) : undefined
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t border-[var(--ds-border-subtle)] hover:bg-[var(--ds-bg-hover)]">
                      <td className="px-4 py-3 text-slate-200">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{formatPhoneNumberDisplay(r.from_phone, 'e164')}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-200 font-medium">{r.flow_name || r.flow_id || '—'}</div>
                        {r.flow_id && r.flow_name && (
                          <div className="text-[11px] text-slate-500 font-mono">{r.flow_id}</div>
                        )}
                        {builder && (
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant="secondary" className="bg-[var(--ds-bg-surface)]/30 text-slate-200 border-[var(--ds-border-subtle)]">
                              Builder
                            </Badge>
                            <Link
                              href={`/flows/builder/${encodeURIComponent(builder.id)}`}
                              className="text-[11px] text-slate-300 hover:text-white underline underline-offset-2"
                            >
                              {builder.name}
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{r.flow_token || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setOpenId(isOpen ? null : r.id)}
                          className="text-slate-200"
                        >
                          {isOpen ? (
                            <>
                              <ChevronUp size={16} />
                              Fechar detalhes
                            </>
                          ) : (
                            <>
                              <ChevronDown size={16} />
                              Ver detalhes
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.id}_details`} className="border-t border-[var(--ds-border-subtle)] bg-black/20">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="rounded-xl bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] p-3">
                              <div className="text-xs text-slate-400 mb-2">response_json (parseado)</div>
                              <pre className="text-[11px] leading-relaxed text-slate-200 overflow-auto max-h-80">
{safePrettyJson(r.response_json)}
                              </pre>
                            </div>
                            <div className="rounded-xl bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] p-3">
                              <div className="text-xs text-slate-400 mb-2">response_json_raw</div>
                              <pre className="text-[11px] leading-relaxed text-slate-200 overflow-auto max-h-80">
{safePrettyJson(r.response_json_raw)}
                              </pre>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                            <div className="rounded-lg bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] p-2">
                              <div className="text-slate-400">message_id</div>
                              <div className="font-mono text-[11px] text-slate-200 break-all">{r.message_id}</div>
                            </div>
                            <div className="rounded-lg bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] p-2">
                              <div className="text-slate-400">phone_number_id</div>
                              <div className="font-mono text-[11px] text-slate-200 break-all">{r.phone_number_id || '—'}</div>
                            </div>
                            <div className="rounded-lg bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] p-2">
                              <div className="text-slate-400">message_timestamp</div>
                              <div className="text-slate-200">{formatDateTime(r.message_timestamp)}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
