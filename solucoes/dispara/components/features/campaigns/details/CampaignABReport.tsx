'use client';

import React from 'react';
import { FlaskConical, TrendingUp } from 'lucide-react';

interface VariantMetrics {
  templateName: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  total: number;
}

interface CampaignABReportProps {
  abTestEnabled: boolean;
  abVariants?: Record<string, VariantMetrics>;
  mainTemplateName?: string;
}

export const CampaignABReport: React.FC<CampaignABReportProps> = ({
  abTestEnabled,
  abVariants,
  mainTemplateName,
}) => {
  if (!abTestEnabled || !abVariants) return null;

  const variantA = abVariants['A'];
  const variantB = abVariants['B'];

  if (!variantA && !variantB) return null;

  // Determine winner by read rate (higher is better)
  const sentA = variantA ? (variantA.sent + variantA.delivered + variantA.read) : 0;
  const sentB = variantB ? (variantB.sent + variantB.delivered + variantB.read) : 0;
  const readRateA = sentA > 0 ? ((variantA?.read ?? 0) / sentA) * 100 : 0;
  const readRateB = sentB > 0 ? ((variantB?.read ?? 0) / sentB) * 100 : 0;

  const winner = readRateA > readRateB ? 'A' : readRateB > readRateA ? 'B' : null;

  const renderVariantCard = (
    label: string,
    variant: VariantMetrics | undefined,
    isWinner: boolean,
  ) => {
    if (!variant) return null;
    const sent = variant.sent + variant.delivered + variant.read;
    const deliveredTotal = variant.delivered + variant.read;
    const deliveryRate = sent > 0 ? ((deliveredTotal / sent) * 100).toFixed(1) : '0.0';
    const readRate = sent > 0 ? ((variant.read / sent) * 100).toFixed(1) : '0.0';

    return (
      <div
        className={`flex-1 rounded-xl border p-4 ${
          isWinner
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--ds-text-muted)]">
              Variante {label}
            </span>
            {isWinner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                <TrendingUp size={10} />
                Vencedor
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 text-sm font-medium text-[var(--ds-text-primary)] truncate">
          {variant.templateName || mainTemplateName || '-'}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[var(--ds-text-muted)]">Enviadas</div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{sent}</div>
          </div>
          <div>
            <div className="text-[var(--ds-text-muted)]">Entregues</div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{deliveredTotal}</div>
          </div>
          <div>
            <div className="text-[var(--ds-text-muted)]">Lidas</div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{variant.read}</div>
          </div>
          <div>
            <div className="text-[var(--ds-text-muted)]">Falhas</div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{variant.failed}</div>
          </div>
          <div>
            <div className="text-[var(--ds-text-muted)]">Taxa de entrega</div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{deliveryRate}%</div>
          </div>
          <div>
            <div className="text-[var(--ds-text-muted)]">Taxa de leitura</div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{readRate}%</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <FlaskConical size={16} className="text-primary-400" />
        <h3 className="text-sm font-semibold text-[var(--ds-text-primary)]">Teste A/B</h3>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        {renderVariantCard('A', variantA, winner === 'A')}
        {renderVariantCard('B', variantB, winner === 'B')}
      </div>
    </div>
  );
};
