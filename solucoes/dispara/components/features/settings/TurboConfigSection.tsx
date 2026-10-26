'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  TurboPlannerSection,
  TurboConfigForm,
  type TurboDraft,
  type TurboPlan,
} from './turbo';
import { Container } from '@/components/ui/container';
import { SectionHeader } from '@/components/ui/section-header';

// Types
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

export interface TurboConfigSectionProps {
  whatsappThrottle?: {
    ok: boolean;
    source?: 'db' | 'env';
    phoneNumberId?: string | null;
    config?: WhatsAppThrottleConfig;
    state?: WhatsAppThrottleState | null;
  } | null;
  whatsappThrottleLoading?: boolean;
  saveWhatsAppThrottle?: (data: Partial<WhatsAppThrottleConfig> & { resetState?: boolean }) => Promise<void>;
  isSaving?: boolean;
  settings: {
    phoneNumberId?: string | null;
  };
}

export function TurboConfigSection({
  whatsappThrottle,
  whatsappThrottleLoading,
  saveWhatsAppThrottle,
  isSaving,
  settings,
}: TurboConfigSectionProps) {
  const turboConfig = whatsappThrottle?.config;
  const turboState = whatsappThrottle?.state;

  const [isEditing, setIsEditing] = useState(false);
  const [turboDraft, setTurboDraft] = useState<TurboDraft>(() => ({
    // Defaults: Balanced profile
    enabled: turboConfig?.enabled ?? true,
    sendConcurrency: (turboConfig as any)?.sendConcurrency ?? 2,
    batchSize: (turboConfig as any)?.batchSize ?? 40,
    startMps: turboConfig?.startMps ?? 20,
    maxMps: turboConfig?.maxMps ?? 80,
    minMps: turboConfig?.minMps ?? 5,
    cooldownSec: turboConfig?.cooldownSec ?? 30,
    minIncreaseGapSec: turboConfig?.minIncreaseGapSec ?? 10,
    sendFloorDelayMs: turboConfig?.sendFloorDelayMs ?? 0,
  }));

  // Keep draft in sync when server data arrives
  useEffect(() => {
    if (!turboConfig) return;
    setTurboDraft({
      enabled: turboConfig.enabled,
      sendConcurrency: (turboConfig as any)?.sendConcurrency ?? 2,
      batchSize: (turboConfig as any)?.batchSize ?? 40,
      startMps: turboConfig.startMps,
      maxMps: turboConfig.maxMps,
      minMps: turboConfig.minMps,
      cooldownSec: turboConfig.cooldownSec,
      minIncreaseGapSec: turboConfig.minIncreaseGapSec,
      sendFloorDelayMs: turboConfig.sendFloorDelayMs,
    });
  }, [
    turboConfig?.enabled,
    (turboConfig as any)?.sendConcurrency,
    (turboConfig as any)?.batchSize,
    turboConfig?.startMps,
    turboConfig?.maxMps,
    turboConfig?.minMps,
    turboConfig?.cooldownSec,
    turboConfig?.minIncreaseGapSec,
    turboConfig?.sendFloorDelayMs,
  ]);

  const handleSave = async () => {
    if (!saveWhatsAppThrottle) return;

    if (turboDraft.minMps > turboDraft.maxMps) {
      toast.error('minMps nao pode ser maior que maxMps');
      return;
    }
    if (turboDraft.startMps < turboDraft.minMps || turboDraft.startMps > turboDraft.maxMps) {
      toast.error('startMps deve estar entre minMps e maxMps');
      return;
    }

    await saveWhatsAppThrottle({
      enabled: turboDraft.enabled,
      sendConcurrency: turboDraft.sendConcurrency,
      batchSize: turboDraft.batchSize,
      startMps: turboDraft.startMps,
      maxMps: turboDraft.maxMps,
      minMps: turboDraft.minMps,
      cooldownSec: turboDraft.cooldownSec,
      minIncreaseGapSec: turboDraft.minIncreaseGapSec,
      sendFloorDelayMs: turboDraft.sendFloorDelayMs,
    });
    setIsEditing(false);
  };

  const handleReset = async () => {
    if (!saveWhatsAppThrottle) return;
    await saveWhatsAppThrottle({ resetState: true });
    toast.success('Aprendizado do modo turbo reiniciado (target voltou pro startMps)');
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (turboConfig) {
      setTurboDraft({
        enabled: turboConfig.enabled,
        sendConcurrency: (turboConfig as any)?.sendConcurrency ?? 2,
        batchSize: (turboConfig as any)?.batchSize ?? 40,
        startMps: turboConfig.startMps,
        maxMps: turboConfig.maxMps,
        minMps: turboConfig.minMps,
        cooldownSec: turboConfig.cooldownSec,
        minIncreaseGapSec: turboConfig.minIncreaseGapSec,
        sendFloorDelayMs: turboConfig.sendFloorDelayMs,
      });
    }
  };

  const handleApplyPlannerSuggestion = (plan: TurboPlan) => {
    setIsEditing(true);
    setTurboDraft((s) => ({
      ...s,
      sendConcurrency: plan.recommended.sendConcurrency,
      batchSize: plan.recommended.batchSize,
      startMps: plan.recommended.startMps,
      maxMps: plan.recommended.maxMps,
    }));
  };

  return (
    <Container variant="glass" padding="lg">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          title="Modo Turbo (Beta)"
          icon={Zap}
          color="brand"
          showIndicator={true}
          description={
            <>Ajuste automatico de taxa baseado em feedback do Meta (ex.: erro <span className="font-mono">130429</span>). Ideal para campanhas grandes.</>
          }
        />

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/settings/performance"
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)] transition-colors text-sm font-medium"
            title="Abrir central de performance"
          >
            Performance
          </Link>
          <Link
            href="/settings/meta-diagnostics"
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)] transition-colors text-sm font-medium"
            title="Abrir diagnóstico Meta"
          >
            Diagnóstico
          </Link>
          <button
            onClick={() => setIsEditing((v) => !v)}
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)] transition-colors text-sm font-medium"
          >
            {isEditing ? 'Fechar' : 'Configurar'}
          </button>
        </div>
      </div>

      {/* Status bar - layout horizontal compacto */}
      <div className="mt-6 flex flex-wrap items-center gap-6 p-4 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl">
        {/* Status */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide">Status</div>
          {whatsappThrottleLoading ? (
            <span className="text-sm text-[var(--ds-text-secondary)]">...</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${turboConfig?.enabled ? 'text-primary-400' : 'text-[var(--ds-text-secondary)]'}`}>
                {turboConfig?.enabled ? 'Ativo' : 'Inativo'}
              </span>
              <span className="text-xs text-[var(--ds-text-muted)]">({whatsappThrottle?.source || '-'})</span>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-[var(--ds-border-default)]" />

        {/* Target MPS */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide">Target</div>
          <span className="text-sm font-mono font-medium text-[var(--ds-text-primary)]">
            {typeof turboState?.targetMps === 'number' ? `${turboState.targetMps} mps` : '-'}
          </span>
        </div>

        <div className="h-6 w-px bg-[var(--ds-border-default)]" />

        {/* Phone ID */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide">Phone ID</div>
          <span className="text-sm font-mono text-[var(--ds-text-primary)]">
            {whatsappThrottle?.phoneNumberId || settings.phoneNumberId || '-'}
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Reset button */}
        <button
          onClick={handleReset}
          disabled={!!isSaving}
          className="inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)] transition-colors text-xs font-medium text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] disabled:opacity-50"
          title="Reseta o targetMps para startMps"
        >
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Resetar
        </button>
      </div>

      <TurboPlannerSection
        turboState={turboState}
        onApplySuggestion={handleApplyPlannerSuggestion}
      />

      {isEditing && (
        <TurboConfigForm
          draft={turboDraft}
          onDraftChange={setTurboDraft}
          onSave={handleSave}
          onCancel={handleCancel}
          isSaving={isSaving}
        />
      )}
    </Container>
  );
}
