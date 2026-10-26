'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface WhatsAppThrottleConfig {
  enabled: boolean;
  sendConcurrency?: number;
  batchSize?: number;
  startMps: number;
  maxMps: number;
  minMps: number;
  cooldownSec: number;
  minIncreaseGapSec: number;
  sendFloorDelayMs: number;
}

interface WhatsAppThrottleState {
  targetMps: number;
  cooldownUntil?: string | null;
  lastIncreaseAt?: string | null;
  lastDecreaseAt?: string | null;
  updatedAt?: string | null;
}

export interface TurboStatusCardProps {
  loading?: boolean;
  config?: WhatsAppThrottleConfig;
  state?: WhatsAppThrottleState | null;
  source?: 'db' | 'env';
}

export function TurboStatusCard({
  loading,
  config,
  state,
  source,
}: TurboStatusCardProps) {
  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4 flex flex-col">
      <div className="text-xs text-[var(--ds-text-muted)] mb-2">Status</div>
      {loading ? (
        <div className="text-sm text-[var(--ds-text-secondary)] flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-lg font-semibold text-[var(--ds-text-primary)]">
            {config?.enabled ? (
              <span className="text-primary-400">Ativo</span>
            ) : (
              <span className="text-[var(--ds-text-secondary)]">Inativo</span>
            )}
            <span className="text-xs font-normal text-[var(--ds-text-muted)] ml-2">fonte: {source || '-'}</span>
          </div>
          <div className="mt-1 text-sm text-[var(--ds-text-secondary)]">
            Target: <span className="font-mono font-medium text-[var(--ds-text-primary)]">{typeof state?.targetMps === 'number' ? state.targetMps : '-'}</span> mps
          </div>
          {state?.cooldownUntil && (
            <div className="mt-1 text-xs text-amber-400">
              Cooldown até: <span className="font-mono">{new Date(state.cooldownUntil).toLocaleString('pt-BR')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
