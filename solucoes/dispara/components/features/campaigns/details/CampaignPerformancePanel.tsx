'use client';

import React, { useState } from 'react';
import { ChevronDown, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Container } from '@/components/ui/container';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DetailCard } from './DetailCard';
import { formatDurationMs, formatThroughput } from './utils';
import { CampaignPerformancePanelProps } from './types';

export const CampaignPerformancePanel: React.FC<CampaignPerformancePanelProps> = ({
  isPerfOpen,
  setIsPerfOpen,
  perfSourceLabel,
  metrics,
  perf,
  throughputMpsForUi,
  dispatchDurationMsForUi,
  isPerfEstimatedLive,
  baselineThroughputMedian,
  limiterInfo,
}) => {
  const [isPerfTechOpen, setIsPerfTechOpen] = useState(false);

  return (
    <Container variant="glass" padding="lg" className="mt-4">
    <Collapsible
      open={isPerfOpen}
      onOpenChange={setIsPerfOpen}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-start justify-between gap-4 text-left"
          aria-label={isPerfOpen ? 'Recolher performance do disparo' : 'Expandir performance do disparo'}
        >
          <div>
            <h3 className="text-[var(--ds-text-primary)] font-bold">Velocidade do disparo</h3>
            <p className="text-xs text-[var(--ds-text-muted)]">
              Conta apenas o periodo do primeiro envio ate o ultimo envio (sent-only).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-1 border ${perfSourceLabel.tone}`}>
              {perfSourceLabel.label}
            </span>
            <ChevronDown
              size={16}
              className={`text-[var(--ds-text-muted)] transition-transform ${isPerfOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4">
        {metrics?.source === 'campaigns_fallback' && (metrics as any)?.hint && (
          <Alert variant="warning">
            <AlertDescription>
              <div className="font-medium">Métricas avançadas indisponíveis</div>
              <div className="mt-1 opacity-80">{(metrics as any).hint}</div>
            </AlertDescription>
          </Alert>
        )}

        <div className={`${metrics?.source === 'campaigns_fallback' && (metrics as any)?.hint ? 'mt-4' : ''} grid grid-cols-1 sm:grid-cols-3 gap-4`}>
          <div className="sm:col-span-2">
            <DetailCard
              title="Velocidade (throughput)"
              value={formatThroughput(throughputMpsForUi)}
              subvalue={(() => {
                const mps = Number(throughputMpsForUi);
                const hasMps = Number.isFinite(mps) && mps > 0;

                if (!hasMps) {
                  if (!perf?.first_dispatch_at) return 'Ainda nao iniciou (sem first_dispatch_at).';
                  if (!perf?.last_sent_at) return 'Em andamento (sem last_sent_at).';
                  return 'Ainda sem dados suficientes para medir throughput.';
                }

                const baselineText = baselineThroughputMedian
                  ? `Baseline (mediana): ${baselineThroughputMedian.toFixed(2)} msg/s`
                  : 'Sem baseline suficiente (rode mais campanhas para comparar).';

                if (isPerfEstimatedLive) {
                  return `Ao vivo (estimado). ${baselineText}`;
                }

                return baselineText;
              })()}
              icon={CheckCircle2}
              color="#10b981"
            />
          </div>

          <DetailCard
            title="Tempo total"
            value={formatDurationMs(dispatchDurationMsForUi)}
            subvalue="Do primeiro envio ate o ultimo envio"
            icon={Clock}
            color="#a1a1aa"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DetailCard
            title="Limitador atual"
            value={limiterInfo.value}
            subvalue={limiterInfo.subvalue}
            icon={AlertCircle}
            color={limiterInfo.color}
          />

          <Container variant="glass" padding="lg" className="sm:col-span-2">
            <Collapsible open={isPerfTechOpen} onOpenChange={setIsPerfTechOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-4 text-left"
                  aria-label={isPerfTechOpen ? 'Recolher detalhes técnicos' : 'Expandir detalhes técnicos'}
                >
                  <div>
                    <div className="text-sm text-[var(--ds-text-secondary)] font-medium">Detalhes técnicos</div>
                    <div className="text-xs text-[var(--ds-text-muted)]">Config aplicada e identificadores (para diagnóstico)</div>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-[var(--ds-text-muted)] transition-transform ${isPerfTechOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-3">
                <div className="text-xs text-[var(--ds-text-secondary)] grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Container variant="subtle" padding="sm">
                    <div className="text-[var(--ds-text-muted)]">Config efetiva</div>
                    <div className="mt-1 font-mono">
                      conc={perf?.config?.effective?.concurrency ?? '—'} | batch={perf?.config?.effective?.configuredBatchSize ?? '—'}
                    </div>
                  </Container>
                  <Container variant="subtle" padding="sm">
                    <div className="text-[var(--ds-text-muted)]">Turbo (adaptive)</div>
                    <div className="mt-1 font-mono">
                      {perf?.config?.adaptive
                        ? `enabled=${String(perf.config.adaptive.enabled)} maxMps=${perf.config.adaptive.maxMps}`
                        : '—'}
                    </div>
                  </Container>
                  <Container variant="subtle" padding="sm">
                    <div className="text-[var(--ds-text-muted)]">Hash de config</div>
                    <div className="mt-1 font-mono">{perf?.config_hash ?? '—'}</div>
                  </Container>
                </div>

                <div className="mt-2 text-[11px] text-[var(--ds-text-muted)]">
                  {perf?.trace_id ? (
                    <span>ID da execução: <span className="font-mono text-[var(--ds-text-secondary)]">{perf.trace_id}</span></span>
                  ) : (
                    <span>ID da execução: <span className="font-mono text-[var(--ds-text-secondary)]">—</span></span>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Container>
        </div>
      </CollapsibleContent>
    </Collapsible>
    </Container>
  );
};
