'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { performanceService } from '../../../../services/performanceService';

interface WhatsAppThrottleState {
  targetMps: number;
  cooldownUntil?: string | null;
  lastIncreaseAt?: string | null;
  lastDecreaseAt?: string | null;
  updatedAt?: string | null;
}

export interface TurboPlan {
  msgs: number;
  secs: number;
  desiredMps: number;
  recommended: {
    sendConcurrency: number;
    batchSize: number;
    startMps: number;
    maxMps: number;
  };
  estimate: {
    concCeilingMps: number | null;
    estimatedMpsInitial: number;
    estimatedSeconds: number | null;
  };
  warnings: string[];
}

export interface TurboPlannerSectionProps {
  turboState?: WhatsAppThrottleState | null;
  onApplySuggestion: (plan: TurboPlan) => void;
}

export function TurboPlannerSection({
  turboState,
  onApplySuggestion,
}: TurboPlannerSectionProps) {
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerMessages, setPlannerMessages] = useState(500);
  const [plannerSeconds, setPlannerSeconds] = useState(60);
  const [plannerLatencyMs, setPlannerLatencyMs] = useState(200);
  const [plannerHeadroom, setPlannerHeadroom] = useState(1.2);
  const [plannerLatencyTouched, setPlannerLatencyTouched] = useState(false);
  const [plannerLoadingBaseline, setPlannerLoadingBaseline] = useState(false);
  const [plannerBaselineMetaMs, setPlannerBaselineMetaMs] = useState<number | null>(null);

  // Load baseline when planner opens
  useEffect(() => {
    if (!isPlannerOpen) return;
    if (plannerBaselineMetaMs != null) return;
    if (plannerLoadingBaseline) return;

    let cancelled = false;
    setPlannerLoadingBaseline(true);
    performanceService
      .getSettingsPerformance({ rangeDays: 7, limit: 50 })
      .then((perf) => {
        if (!cancelled && perf?.totals?.meta_avg_ms?.median != null) {
          setPlannerBaselineMetaMs(perf.totals.meta_avg_ms.median);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPlannerLoadingBaseline(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPlannerOpen, plannerBaselineMetaMs, plannerLoadingBaseline]);

  // Update planner latency from baseline (if user hasn't touched)
  useEffect(() => {
    if (!isPlannerOpen) return;
    if (plannerLatencyTouched) return;
    if (plannerBaselineMetaMs == null) return;
    setPlannerLatencyMs(Math.round(plannerBaselineMetaMs * 1.2));
  }, [isPlannerOpen, plannerBaselineMetaMs, plannerLatencyTouched]);

  // Turbo plan calculation
  const turboPlan = useMemo<TurboPlan>(() => {
    const msgs = Math.max(1, plannerMessages);
    const secs = Math.max(1, plannerSeconds);
    const desiredMps = msgs / secs;
    const latency = Math.max(50, plannerLatencyMs);
    const headroom = Math.max(1.0, plannerHeadroom);

    const concCeilingMps = latency > 0 ? 1000 / latency : null;
    const sendConcurrency =
      concCeilingMps != null && desiredMps > concCeilingMps
        ? Math.ceil(desiredMps / concCeilingMps)
        : 1;

    const safeMaxMps = Math.ceil(desiredMps * headroom);
    const startMps = Math.max(1, Math.round(safeMaxMps * 0.6));

    const warnings: string[] = [];
    if (typeof turboState?.targetMps === 'number' && turboState.targetMps < startMps) {
      warnings.push(
        `O target atual (${turboState.targetMps} mps) e menor que startMps (${startMps}). Se salvar, considere "Resetar aprendizado".`
      );
    }
    if (sendConcurrency > 1) {
      warnings.push(
        `Com latencia ~${latency}ms, 1 thread so consegue ~${concCeilingMps?.toFixed(1)} mps. Sugerindo concorrencia=${sendConcurrency}.`
      );
    }
    if (safeMaxMps > 100) {
      warnings.push(`Meta de ${msgs} msgs em ${secs}s e agressiva. Pode sofrer throttle do Meta.`);
    }

    const estimatedMpsInitial = sendConcurrency * ((concCeilingMps ?? desiredMps) * 0.8);
    const estimatedSeconds = msgs > 0 && estimatedMpsInitial > 0 ? msgs / estimatedMpsInitial : null;

    return {
      msgs,
      secs,
      desiredMps,
      recommended: {
        sendConcurrency,
        batchSize: Math.min(100, Math.max(10, sendConcurrency * 10)),
        startMps,
        maxMps: safeMaxMps,
      },
      estimate: {
        concCeilingMps,
        estimatedMpsInitial,
        estimatedSeconds,
      },
      warnings,
    };
  }, [plannerMessages, plannerSeconds, plannerLatencyMs, plannerHeadroom, turboState?.targetMps]);

  const handleApplySuggestion = () => {
    onApplySuggestion(turboPlan);
    toast.success('Sugestao aplicada no formulario do Turbo. Agora e so Salvar.');
  };

  const handleLoadExample = () => {
    setPlannerMessages(174);
    setPlannerSeconds(10);
    toast.message('Exemplo carregado: 174 msgs em 10s');
  };

  return (
    <div className="mt-4 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-2xl">
      <button
        type="button"
        onClick={() => setIsPlannerOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3"
      >
        <div className="text-left">
          <div className="text-sm font-medium text-[var(--ds-text-primary)]">Planejador de disparo</div>
          <div className="text-xs text-[var(--ds-text-secondary)]">Diga "quantas mensagens" e "em quanto tempo" e eu sugiro a config.</div>
        </div>
        <div className="text-[var(--ds-text-secondary)]">
          {isPlannerOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {isPlannerOpen && (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">Mensagens</label>
              <input
                type="number"
                value={plannerMessages}
                onChange={(e) => setPlannerMessages(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                min={1}
                max={100000}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">Tempo alvo (seg)</label>
              <input
                type="number"
                value={plannerSeconds}
                onChange={(e) => setPlannerSeconds(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                min={1}
                max={3600}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">Latencia estimada (ms)</label>
              <input
                type="number"
                value={plannerLatencyMs}
                onChange={(e) => {
                  setPlannerLatencyTouched(true);
                  setPlannerLatencyMs(Number(e.target.value));
                }}
                className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                min={50}
                max={5000}
              />
              <div className="mt-1 text-[11px] text-[var(--ds-text-muted)]">
                {plannerLoadingBaseline
                  ? 'Buscando baseline...'
                  : plannerBaselineMetaMs != null
                    ? `baseline (mediana): ~${Math.round(plannerBaselineMetaMs)}ms`
                    : 'baseline indisponivel (use um chute)'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">Margem (headroom)</label>
              <input
                type="number"
                value={plannerHeadroom}
                onChange={(e) => setPlannerHeadroom(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                min={1.0}
                max={2.5}
                step={0.05}
              />
              <div className="mt-1 text-[11px] text-[var(--ds-text-muted)]">1.2 = folga padrao</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-4">
              <div className="text-xs text-[var(--ds-text-muted)]">Meta</div>
              <div className="mt-2 text-sm text-[var(--ds-text-primary)]">
                {turboPlan.msgs} msgs em {turboPlan.secs}s
              </div>
              <div className="mt-1 text-xs text-[var(--ds-text-secondary)]">
                Precisa de <span className="font-mono text-[var(--ds-text-primary)]">{turboPlan.desiredMps.toFixed(2)}</span> mps
              </div>
              <div className="mt-2 text-[11px] text-[var(--ds-text-muted)]">
                Regra pratica: throughput = concurrency / latencia
              </div>
            </div>

            <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-4">
              <div className="text-xs text-[var(--ds-text-muted)]">Sugestao de config</div>
              <div className="mt-2 text-xs text-[var(--ds-text-secondary)] space-y-1">
                <div className="flex justify-between gap-3"><span className="text-[var(--ds-text-secondary)]">sendConcurrency</span><span className="font-mono text-[var(--ds-text-primary)]">{turboPlan.recommended.sendConcurrency}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[var(--ds-text-secondary)]">batchSize</span><span className="font-mono text-[var(--ds-text-primary)]">{turboPlan.recommended.batchSize}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[var(--ds-text-secondary)]">startMps</span><span className="font-mono text-[var(--ds-text-primary)]">{turboPlan.recommended.startMps}</span></div>
                <div className="flex justify-between gap-3"><span className="text-[var(--ds-text-secondary)]">maxMps</span><span className="font-mono text-[var(--ds-text-primary)]">{turboPlan.recommended.maxMps}</span></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleApplySuggestion}
                  className="h-10 px-3 bg-primary-600 text-white dark:bg-white dark:text-black font-semibold rounded-lg hover:bg-primary-500 dark:hover:bg-neutral-100 transition-colors text-sm"
                >
                  Aplicar no Turbo
                </button>

                <button
                  type="button"
                  onClick={handleLoadExample}
                  className="h-10 px-3 bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-subtle)] rounded-lg transition-colors text-sm text-[var(--ds-text-primary)]"
                >
                  Exemplo 174/10s
                </button>
              </div>
            </div>

            <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-4">
              <div className="text-xs text-[var(--ds-text-muted)]">Estimativa</div>
              <div className="mt-2 text-xs text-[var(--ds-text-secondary)] space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--ds-text-secondary)]">teto por concorrencia</span>
                  <span className="font-mono text-[var(--ds-text-primary)]">{turboPlan.estimate.concCeilingMps != null ? turboPlan.estimate.concCeilingMps.toFixed(2) : '-'} mps</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--ds-text-secondary)]">mps inicial (com startMps)</span>
                  <span className="font-mono text-[var(--ds-text-primary)]">{turboPlan.estimate.estimatedMpsInitial.toFixed(2)} mps</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--ds-text-secondary)]">tempo estimado</span>
                  <span className="font-mono text-[var(--ds-text-primary)]">{turboPlan.estimate.estimatedSeconds != null ? `${Math.ceil(turboPlan.estimate.estimatedSeconds)}s` : '-'}</span>
                </div>
              </div>

              {turboPlan.warnings.length > 0 && (
                <div className="mt-3 text-[11px] text-amber-300 space-y-1">
                  {turboPlan.warnings.slice(0, 4).map((w, i) => (
                    <div key={i}>* {w}</div>
                  ))}
                </div>
              )}

              <div className="mt-3 text-[11px] text-[var(--ds-text-muted)]">
                Nota: mesmo com config perfeita, o Meta pode aplicar limites e devolver <span className="font-mono">130429</span>. O Turbo existe pra achar o teto seguro.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
