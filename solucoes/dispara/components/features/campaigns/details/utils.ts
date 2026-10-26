import { CampaignStatus } from '@/types';

export const formatDurationMs = (ms: number | null | undefined): string => {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
};

export const formatThroughput = (mps: number | null | undefined): string => {
  if (!Number.isFinite(mps as number) || (mps as number) <= 0) return '—';
  const v = mps as number;
  const perMin = v * 60;
  return `${v.toFixed(2)} msg/s (${perMin.toFixed(1)} msg/min)`;
};

export const formatMs = (ms: number | null | undefined): string => {
  if (!Number.isFinite(ms as number) || (ms as number) <= 0) return '—';
  const v = ms as number;
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
};

export const getCampaignStatusClass = (status: CampaignStatus): string => {
  switch (status) {
    case CampaignStatus.COMPLETED:
      return 'bg-primary-500/10 border-primary-500/20 text-primary-400';
    case CampaignStatus.SENDING:
      return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
    case CampaignStatus.CANCELLED:
      return 'bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]';
    case CampaignStatus.PAUSED:
      return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    case CampaignStatus.SCHEDULED:
      return 'bg-violet-500/10 border-violet-500/20 text-violet-400';
    case CampaignStatus.FAILED:
      return 'bg-red-500/10 border-red-500/20 text-red-400';
    default:
      return 'bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]';
  }
};

export const formatScheduledTime = (scheduledAt: string | null | undefined): string | null => {
  if (!scheduledAt) return null;
  return new Date(scheduledAt).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

export const computeBaselineThroughputMedian = (baseline: any[]): number | null => {
  const vals = baseline
    .map((r: any) => Number(r?.throughput_mps))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .sort((a: number, b: number) => a - b);

  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
};

export const computePerfSourceLabel = (source: string | undefined): { label: string; tone: string } => {
  const s = String(source || '').trim();
  if (s === 'run_metrics') return { label: 'Dados: avançados', tone: 'text-primary-300 bg-primary-500/10 border-primary-500/20' };
  if (s === 'campaigns_fallback') return { label: 'Dados: básicos', tone: 'text-amber-200 bg-amber-500/10 border-amber-500/20' };
  if (!s) return { label: 'Dados: —', tone: 'text-[var(--ds-text-muted)] bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]' };
  return { label: `Dados: ${s}`, tone: 'text-[var(--ds-text-muted)] bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]' };
};

export const computeLimiterInfo = (
  perf: any,
  metricsSource: string | undefined
): { value: string; subvalue: string; color: string } => {
  const saw429 = perf?.saw_throughput_429;
  const metaAvg = Number(perf?.meta_avg_ms);
  const hasMetaAvg = Number.isFinite(metaAvg) && metaAvg > 0;

  if (saw429 === true) {
    return {
      value: 'Rate limit',
      subvalue: 'A Meta sinalizou 130429 (throughput). Reduza a pressao (mps/concurrency) ou aumente o cooldown.',
      color: '#f59e0b',
    };
  }

  if (saw429 === false) {
    return {
      value: 'OK',
      subvalue: hasMetaAvg
        ? `Sem 130429. Latencia media da Meta: ${formatMs(metaAvg)}.`
        : 'Sem 130429 detectado nesta execução.',
      color: '#3b82f6',
    };
  }

  // Unknown
  if (metricsSource === 'campaigns_fallback') {
    return {
      value: '—',
      subvalue: 'Sinais da Meta (130429/latência) exigem métricas avançadas (run_metrics).',
      color: '#3b82f6',
    };
  }

  // Fonte avançada, mas sem telemetria útil (ex.: execução curta demais ou batch_metrics não foi registrado)
  return {
    value: 'Sem telemetria',
    subvalue: 'Esta execução não registrou sinal de 130429 nem latência média da Meta. Rode uma campanha maior ou verifique se os batches estão gravando métricas.',
    color: '#3b82f6',
  };
};
