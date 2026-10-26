'use client';

import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

export const TURBO_PRESETS = {
  leve: {
    label: 'Safe (Leve)',
    desc: 'Mais seguro: comeca baixo e sobe devagar (prioriza estabilidade).',
    values: {
      sendConcurrency: 1,
      batchSize: 10,
      startMps: 10,
      maxMps: 30,
      minMps: 5,
      cooldownSec: 60,
      minIncreaseGapSec: 20,
      sendFloorDelayMs: 150,
    },
  },
  moderado: {
    label: 'Balanced (Moderado)',
    desc: 'Equilibrio: boa velocidade com risco controlado de 130429.',
    values: {
      sendConcurrency: 2,
      batchSize: 25,
      startMps: 20,
      maxMps: 80,
      minMps: 5,
      cooldownSec: 30,
      minIncreaseGapSec: 12,
      sendFloorDelayMs: 50,
    },
  },
  agressivo: {
    label: 'Boost (Agressivo)',
    desc: 'Velocidade maxima: sobe rapido e busca teto alto (pode bater 130429).',
    values: {
      sendConcurrency: 4,
      batchSize: 80,
      startMps: 30,
      maxMps: 150,
      minMps: 5,
      cooldownSec: 20,
      minIncreaseGapSec: 8,
      sendFloorDelayMs: 0,
    },
  },
} as const;

export type TurboPresetKey = keyof typeof TURBO_PRESETS;

export interface TurboDraft {
  enabled: boolean;
  sendConcurrency: number;
  batchSize: number;
  startMps: number;
  maxMps: number;
  minMps: number;
  cooldownSec: number;
  minIncreaseGapSec: number;
  sendFloorDelayMs: number;
}

export interface TurboConfigFormProps {
  draft: TurboDraft;
  onDraftChange: (draft: TurboDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function TurboConfigForm({
  draft,
  onDraftChange,
  onSave,
  onCancel,
  isSaving,
}: TurboConfigFormProps) {
  const applyPreset = (key: TurboPresetKey) => {
    const preset = TURBO_PRESETS[key];
    onDraftChange({
      ...draft,
      ...preset.values,
    });
    toast.message(`Preset aplicado: ${preset.label}`, {
      description: preset.desc,
    });
  };

  const updateField = <K extends keyof TurboDraft>(key: K, value: TurboDraft[K]) => {
    onDraftChange({ ...draft, [key]: value });
  };

  return (
    <div className="mt-6 p-5 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[var(--ds-text-primary)]">Configurações</div>
        <label className="flex items-center gap-2 text-sm text-[var(--ds-text-primary)]">
          <input
            type="checkbox"
            checked={!!draft.enabled}
            onChange={(e) => updateField('enabled', e.target.checked)}
            className="accent-primary-500"
          />
          Ativar modo turbo
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="text-xs text-[var(--ds-text-secondary)]">Perfis rapidos</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TURBO_PRESETS) as TurboPresetKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => applyPreset(k)}
              className="h-10 px-3 bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)] rounded-lg transition-colors text-xs text-[var(--ds-text-primary)]"
              title={TURBO_PRESETS[k].desc}
            >
              {TURBO_PRESETS[k].label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-[var(--ds-text-muted)]">
          Dica: se voce aplicar um perfil que muda <span className="font-mono">startMps</span>, use "Resetar aprendizado" para o target atual acompanhar.
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">sendConcurrency</label>
          <input
            type="number"
            value={draft.sendConcurrency}
            onChange={(e) => updateField('sendConcurrency', Number(e.target.value))}
            className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
            min={1}
            max={50}
          />
          <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Quantos envios em paralelo por batch (1 = sequencial).</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">batchSize</label>
          <input
            type="number"
            value={draft.batchSize}
            onChange={(e) => updateField('batchSize', Number(e.target.value))}
            className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
            min={1}
            max={200}
          />
          <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Quantos contatos por step do workflow (mais alto = menos steps). Dica: use batchSize &gt;= sendConcurrency.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">startMps</label>
          <input
            type="number"
            value={draft.startMps}
            onChange={(e) => updateField('startMps', Number(e.target.value))}
            className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
            min={1}
            max={1000}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">maxMps</label>
          <input
            type="number"
            value={draft.maxMps}
            onChange={(e) => updateField('maxMps', Number(e.target.value))}
            className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
            min={1}
            max={1000}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">minMps</label>
          <input
            type="number"
            value={draft.minMps}
            onChange={(e) => updateField('minMps', Number(e.target.value))}
            className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
            min={1}
            max={1000}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">cooldownSec</label>
          <input
            type="number"
            value={draft.cooldownSec}
            onChange={(e) => updateField('cooldownSec', Number(e.target.value))}
            className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
            min={1}
            max={600}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">minIncreaseGapSec</label>
          <input
            type="number"
            value={draft.minIncreaseGapSec}
            onChange={(e) => updateField('minIncreaseGapSec', Number(e.target.value))}
            className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
            min={1}
            max={600}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">sendFloorDelayMs</label>
          <input
            type="number"
            value={draft.sendFloorDelayMs}
            onChange={(e) => updateField('sendFloorDelayMs', Number(e.target.value))}
            className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
            min={0}
            max={5000}
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="h-10 px-4 text-sm text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={!!isSaving}
          className="h-10 px-5 bg-primary-600 text-white dark:bg-white dark:text-black font-bold rounded-lg hover:bg-primary-500 dark:hover:bg-neutral-100 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar
        </button>
      </div>

      <p className="mt-4 text-xs text-[var(--ds-text-muted)]">
        Dica: se voce alterar <span className="font-mono">startMps</span>, use "Resetar aprendizado" para o target atual acompanhar.
      </p>
    </div>
  );
}
