'use client'

import React from 'react'
import { RefreshCw, AlertTriangle, ArrowLeft, Activity, TrendingUp, Timer, Hash } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from '@/components/ui/lazy-charts'
import { PrefetchLink } from '@/components/ui/PrefetchLink'
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'
import type { SettingsPerformanceResponse } from '@/services/performanceService'
import { Container } from '@/components/ui/container'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function roundNiceMax(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1
  // arredonda para um teto "bonito" (1/2/5 * 10^k)
  const k = Math.pow(10, Math.floor(Math.log10(n)))
  const base = n / k
  const m = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10
  return m * k
}

function Gauge(props: {
  title: string
  value: number | null | undefined
  max: number
  subtitle?: string
  footerLeft?: string
  footerRight?: string
}) {
  const size = 220
  const cx = size / 2
  const cy = size / 2 + 24
  const r = 78

  const value = typeof props.value === 'number' && Number.isFinite(props.value) ? props.value : null
  const max = Math.max(1e-9, props.max)
  const pct = value === null ? 0 : clamp(value / max, 0, 1)

  // Semi-círculo: 180° (esquerda) → 0° (direita)
  const startAngle = Math.PI
  const endAngle = 0
  const angle = startAngle + (endAngle - startAngle) * pct

  const x = cx + r * Math.cos(angle)
  const y = cy + r * Math.sin(angle)

  // arco base (semicírculo)
  const sx = cx + r * Math.cos(startAngle)
  const sy = cy + r * Math.sin(startAngle)
  const ex = cx + r * Math.cos(endAngle)
  const ey = cy + r * Math.sin(endAngle)

  const arcD = `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`
  const arcFillD = `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${x} ${y}`

  return (
    <Container variant="glass" padding="md">
      <div className="text-xs text-[var(--ds-text-muted)]">{props.title}</div>
      <div className="mt-1 text-sm text-[var(--ds-text-secondary)]">{props.subtitle || '—'}</div>

      <div className="mt-4 flex items-center justify-center">
        <svg width={size} height={size / 2 + 70} viewBox={`0 0 ${size} ${size / 2 + 70}`} role="img" aria-label={props.title}>
          {/* Trilho */}
          <path d={arcD} fill="none" stroke="#27272a" strokeWidth={14} strokeLinecap="round" />

          {/* Faixas discretas de risco */}
          <path d={arcD} fill="none" stroke="#3f3f46" strokeWidth={14} strokeLinecap="round" opacity={0.35} />
          <path d={arcD} fill="none" stroke="#10b981" strokeWidth={14} strokeLinecap="round" opacity={0.18} />
          <path d={arcD} fill="none" stroke="#f59e0b" strokeWidth={14} strokeLinecap="round" opacity={0.14} />
          <path d={arcD} fill="none" stroke="#ef4444" strokeWidth={14} strokeLinecap="round" opacity={0.10} />

          {/* Preenchimento */}
          <path d={arcFillD} fill="none" stroke="#10b981" strokeWidth={14} strokeLinecap="round" />

          {/* Ponteiro */}
          <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth={3} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={6} fill="#e5e7eb" />
          <circle cx={cx} cy={cy} r={2.5} fill="#0f172a" opacity={0.8} />

          {/* Labels */}
          <text x={cx} y={cy - 18} textAnchor="middle" fill="#e5e7eb" fontSize="22" fontWeight="700">
            {value === null ? '—' : value.toFixed(2)}
          </text>
          <text x={cx} y={cy + 6} textAnchor="middle" fill="#a1a1aa" fontSize="12">
            mps (mediana)
          </text>

          <text x={sx} y={sy + 28} textAnchor="start" fill="#71717a" fontSize="11">
            0
          </text>
          <text x={ex} y={ey + 28} textAnchor="end" fill="#71717a" fontSize="11">
            {fmtNumber(max, 0)}
          </text>
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-[var(--ds-text-muted)]">
        <span>{props.footerLeft || ''}</span>
        <span>{props.footerRight || ''}</span>
      </div>
    </Container>
  )
}

function fmtNumber(n: number | null | undefined, digits = 1): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function fmtInt(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('pt-BR')
}

function fmtPct(n: number | null | undefined, digits = 0): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`
}

function fmtMs(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  if (n < 1000) return `${Math.round(n)} ms`
  return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
}

function pickConfigSummary(config: any): string {
  const adaptive = config?.adaptive
  const eff = config?.effective
  if (!adaptive && !eff) return '—'

  const parts: string[] = []
  if (adaptive) {
    const enabled = adaptive.enabled ? 'on' : 'off'
    parts.push(`adaptive=${enabled}`)
    if (typeof adaptive.sendConcurrency === 'number') parts.push(`conc=${adaptive.sendConcurrency}`)
    if (typeof adaptive.batchSize === 'number') parts.push(`batch=${adaptive.batchSize}`)
    if (typeof adaptive.startMps === 'number') parts.push(`start=${adaptive.startMps}`)
    if (typeof adaptive.maxMps === 'number') parts.push(`max=${adaptive.maxMps}`)
    if (typeof adaptive.cooldownSec === 'number') parts.push(`cooldown=${adaptive.cooldownSec}s`)
  }
  if (eff) {
    if (typeof eff.configuredBatchSize === 'number') parts.push(`cfgBatch=${eff.configuredBatchSize}`)
    if (typeof eff.concurrency === 'number') parts.push(`effConc=${eff.concurrency}`)
  }

  return parts.join(' · ')
}

export function SettingsPerformanceView(props: {
  data?: SettingsPerformanceResponse
  isLoading: boolean
  isFetching: boolean
  rangeDays: number
  setRangeDays: (n: number) => void
  selectedConfigHash: string | null
  setSelectedConfigHash: (v: string | null) => void
  filteredRuns: Array<{ created_at: string; throughput_mps: number | null; meta_avg_ms: number | null; config_hash: string | null }>
  configs: SettingsPerformanceResponse['byConfig']
  onRefresh: () => void
  hint?: string
}) {
  const { data } = props
  const [isMounted, setIsMounted] = React.useState(false)
  const chartContainerRef = React.useRef<HTMLDivElement>(null)

  const gaugeMax = React.useMemo(() => {
    const candidates: number[] = []
    const p90 = data?.totals?.throughput_mps?.p90
    if (typeof p90 === 'number' && Number.isFinite(p90) && p90 > 0) candidates.push(p90)
    const bestP90 = props.configs?.[0]?.throughput_mps?.p90
    if (typeof bestP90 === 'number' && Number.isFinite(bestP90) && bestP90 > 0) candidates.push(bestP90)
    const max = candidates.length ? Math.max(...candidates) * 1.2 : 5
    return roundNiceMax(Math.max(1, max))
  }, [data?.totals?.throughput_mps?.p90, props.configs])

  const chartData = React.useMemo(() => {
    return props.filteredRuns.map((r, idx) => {
      const dt = new Date(r.created_at)
      return {
        idx,
        label: dt.toLocaleString('pt-BR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        throughput: typeof r.throughput_mps === 'number' ? r.throughput_mps : null,
        metaAvg: typeof r.meta_avg_ms === 'number' ? r.meta_avg_ms : null,
      }
    })
  }, [props.filteredRuns])

  React.useEffect(() => {
    // Aguarda o browser calcular as dimensões do container antes de renderizar o chart
    const timer = setTimeout(() => {
      const container = chartContainerRef.current
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        setIsMounted(true)
      } else {
        // Fallback: renderiza mesmo assim após 500ms
        setTimeout(() => setIsMounted(true), 500)
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Performance (central)</PageTitle>
          <PageDescription>
            Baselines e histórico de throughput (sent-only), por configuração (config_hash). Sem menu extra: acesse por URL.
          </PageDescription>
        </div>

        <PageActions>
          <PrefetchLink
            href="/settings"
            className="px-4 py-2 rounded-xl bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)] transition-all text-sm font-medium flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Voltar
          </PrefetchLink>

          <button
            onClick={props.onRefresh}
            className="px-4 py-2 rounded-xl bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-subtle)] hover:border-[var(--ds-border-default)] transition-all text-sm font-medium flex items-center gap-2"
            title="Atualizar"
          >
            <RefreshCw size={16} className={props.isFetching ? 'animate-spin' : ''} />
            {props.isFetching ? 'Atualizando…' : 'Atualizar'}
          </button>
        </PageActions>
      </PageHeader>

      {data?.source === 'campaigns_fallback' && (
        <Alert variant="warning">
          <AlertTitle>Métricas avançadas indisponíveis (fallback)</AlertTitle>
          <AlertDescription>
            {props.hint || data.hint || 'Aplique a migration 0008 e rode novas campanhas para habilitar baselines por execução.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="text-xs text-[var(--ds-text-secondary)]">Janela:</div>
        {[7, 30, 90, 180].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => props.setRangeDays(d)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${props.rangeDays === d
              ? 'bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)] border-[var(--ds-border-default)]'
              : 'bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] border-[var(--ds-border-subtle)] hover:bg-[var(--ds-bg-hover)]'
              }`}
          >
            {d}d
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-[var(--ds-text-secondary)]">Filtro config:</div>
          <select
            value={props.selectedConfigHash || ''}
            onChange={(e) => props.setSelectedConfigHash(e.target.value || null)}
            className="px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-lg text-xs text-[var(--ds-text-primary)] font-mono"
          >
            <option value="">(todas)</option>
            {(props.configs || []).map((c) => (
              <option key={c.config_hash} value={c.config_hash}>
                {c.config_hash} ({c.sample_size})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Container variant="glass" padding="sm">
          <div className="flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
            <Activity size={14} /> Runs
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--ds-text-primary)]">{data ? fmtInt(data.totals.runs) : '—'}</div>
          <div className="mt-1 text-xs text-[var(--ds-text-muted)]">amostras: {data ? fmtInt(data.totals.throughput_mps.samples) : '—'}</div>
        </Container>

        <Container variant="glass" padding="sm">
          <div className="flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
            <TrendingUp size={14} /> Throughput (mps)
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--ds-text-primary)]">{data ? fmtNumber(data.totals.throughput_mps.median, 2) : '—'}</div>
          <div className="mt-1 text-xs text-[var(--ds-text-muted)]">p90: {data ? fmtNumber(data.totals.throughput_mps.p90, 2) : '—'}</div>
        </Container>

        <Container variant="glass" padding="sm">
          <div className="flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
            <Timer size={14} /> Meta avg
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--ds-text-primary)]">{data ? fmtMs(data.totals.meta_avg_ms.median) : '—'}</div>
          <div className="mt-1 text-xs text-[var(--ds-text-muted)]">amostras: {data ? fmtInt(data.totals.meta_avg_ms.samples) : '—'}</div>
        </Container>

        <Container variant="glass" padding="sm">
          <div className="flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
            <AlertTriangle size={14} /> 130429
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--ds-text-primary)]">{data ? fmtPct(data.totals.throughput_429_rate, 1) : '—'}</div>
          <div className="mt-1 text-xs text-[var(--ds-text-muted)]">taxa no período</div>
        </Container>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Gauge
          title="Velocidade do disparo"
          subtitle="Impacto visual do baseline (sent-only)"
          value={data?.totals?.throughput_mps?.median}
          max={gaugeMax}
          footerLeft={data?.source ? `fonte: ${data.source}` : ''}
          footerRight={data?.totals?.throughput_mps?.p90 ? `p90: ${fmtNumber(data.totals.throughput_mps.p90, 2)} mps` : ''}
        />

        <Container variant="glass" padding="md" className="lg:col-span-2">
          <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Como ler esse gauge</div>
          <div className="mt-2 text-sm text-[var(--ds-text-secondary)] space-y-2">
            <p>
              O ponteiro mostra a <span className="font-medium text-[var(--ds-text-primary)]">mediana</span> do throughput (mps) no período selecionado.
            </p>
            <p>
              O teto é ajustado automaticamente (com base no <span className="font-medium text-[var(--ds-text-primary)]">p90</span>) para manter o velocímetro “vivo” e comparável.
            </p>
            <p className="text-xs text-[var(--ds-text-muted)]">
              Dica: aplique presets (Safe/Balanced/Boost) e rode campanhas suficientes para aumentar a confiança do baseline.
            </p>
          </div>
        </Container>
      </div>

      <Container variant="glass" padding="md" className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Histórico de throughput (sent-only)</div>
            <div className="text-xs text-[var(--ds-text-muted)]">
              fonte: <span className="font-mono">{data?.source || '—'}</span>
              {props.selectedConfigHash ? (
                <>
                  {' '}· filtro: <span className="font-mono">{props.selectedConfigHash}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="text-xs text-[var(--ds-text-muted)]">{props.isLoading ? 'Carregando…' : `${props.filteredRuns.length} pontos`}</div>
        </div>

        <div ref={chartContainerRef} className="mt-4 h-72 w-full">
          {isMounted && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11 }} minTickGap={24} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', color: '#fff' }}
                formatter={(value: any, name: any) => {
                  if (name === 'throughput') return [typeof value === 'number' ? value.toFixed(2) : value, 'mps']
                  if (name === 'metaAvg') return [typeof value === 'number' ? `${Math.round(value)} ms` : value, 'Meta avg']
                  return [value, name]
                }}
                labelFormatter={(label: any) => `Quando: ${label}`}
              />
              <Area type="monotone" dataKey="throughput" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorThroughput)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full rounded-xl bg-[var(--ds-bg-hover)]" aria-hidden="true" />
          )}
        </div>
      </Container>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Container variant="glass" padding="md">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Baselines por config_hash</div>
            <div className="text-xs text-[var(--ds-text-muted)]">ordenado por mediana</div>
          </div>

          {(!props.configs || props.configs.length === 0) ? (
            <div className="mt-4 text-sm text-[var(--ds-text-muted)]">Sem dados por configuração ainda.</div>
          ) : (
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[var(--ds-text-muted)]">
                  <tr className="border-b border-[var(--ds-border-subtle)]">
                    <th className="py-2 pr-2">Config</th>
                    <th className="py-2 pr-2">Amostras</th>
                    <th className="py-2 pr-2">Mediana (mps)</th>
                    <th className="py-2 pr-2">p90 (mps)</th>
                    <th className="py-2 pr-2">429</th>
                  </tr>
                </thead>
                <tbody>
                  {props.configs.slice(0, 12).map((c) => (
                    <tr key={c.config_hash} className="border-b border-[var(--ds-border-subtle)] hover:bg-[var(--ds-bg-hover)] transition-colors">
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => props.setSelectedConfigHash(c.config_hash)}
                          className="font-mono text-[var(--ds-text-primary)]/90 hover:text-[var(--ds-text-primary)]"
                          title={pickConfigSummary(c.config)}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Hash size={12} className="text-[var(--ds-text-muted)]" />
                            {c.config_hash}
                          </span>
                        </button>
                        <div className="mt-1 text-[11px] text-[var(--ds-text-muted)] truncate max-w-[420px]" title={pickConfigSummary(c.config)}>
                          {pickConfigSummary(c.config)}
                        </div>
                      </td>
                      <td className="py-2 pr-2 text-[var(--ds-text-secondary)]">{fmtInt(c.sample_size)}</td>
                      <td className="py-2 pr-2 text-[var(--ds-text-primary)]">{fmtNumber(c.throughput_mps.median, 2)}</td>
                      <td className="py-2 pr-2 text-[var(--ds-text-secondary)]">{fmtNumber(c.throughput_mps.p90, 2)}</td>
                      <td className="py-2 pr-2 text-[var(--ds-text-secondary)]">{fmtPct(c.throughput_429_rate, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {props.selectedConfigHash && (
            <div className="mt-3 text-xs text-[var(--ds-text-muted)]">
              Filtro ativo: <span className="font-mono text-[var(--ds-text-primary)]">{props.selectedConfigHash}</span>
              <button
                type="button"
                onClick={() => props.setSelectedConfigHash(null)}
                className="ml-2 text-primary-300 hover:text-primary-200"
              >
                limpar
              </button>
            </div>
          )}
        </Container>

        <Container variant="glass" padding="md">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Notas</div>
          </div>

          <div className="mt-3 text-sm text-[var(--ds-text-secondary)] space-y-2">
            <p>
              <span className="font-medium text-[var(--ds-text-primary)]">Baseline</span> aqui é a <span className="font-medium">mediana</span> do throughput por <span className="font-mono">config_hash</span> no período.
            </p>
            <p>
              Se você mudou presets (Safe/Balanced/Boost) mas não rodou campanhas suficientes, a amostra ainda vai ficar pequena.
            </p>
            <p className="text-[var(--ds-text-secondary)] text-xs">
              Dica operacional: quando alterar muito <span className="font-mono">startMps</span>, use “Resetar aprendizado” no Turbo para alinhar o target atual.
            </p>
          </div>
        </Container>
      </div>
    </Page>
  )
}
