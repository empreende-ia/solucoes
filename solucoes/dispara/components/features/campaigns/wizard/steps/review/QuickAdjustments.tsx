'use client';

import React from 'react';
import { humanizeVarSource } from '@/lib/precheck-humanizer';
import type { CustomFieldDefinition } from '@/types';
import type { MissingSummaryItem, FixedValueDialogSlot } from './types';
import { formatVarKeyForHumans, getWhereLabel } from './utils';
import { QuickFillDropdown } from './QuickFillDropdown';

interface QuickAdjustmentsProps {
  missingSummary: MissingSummaryItem[];
  customFieldLabelByKey: Record<string, string>;
  recipientSource: 'all' | 'specific' | 'test' | null;
  customFields: CustomFieldDefinition[];
  onApplyQuickFill: (slot: FixedValueDialogSlot, value: string) => void;
  onOpenFixedValueDialog: (slot: FixedValueDialogSlot) => void;
}

export function QuickAdjustments({
  missingSummary,
  customFieldLabelByKey,
  recipientSource,
  customFields,
  onApplyQuickFill,
  onOpenFixedValueDialog,
}: QuickAdjustmentsProps) {
  if (missingSummary.length === 0) {
    return null;
  }

  return (
    <div className="bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[var(--ds-text-secondary)] font-medium">Ajustes rápidos</p>
          <p className="text-[11px] text-[var(--ds-text-muted)]">
            A checagem roda <span className="text-[var(--ds-text-primary)]">automaticamente</span>.
            Se algum contato estiver sendo ignorado por falta de dado, escolha o
            que usar em cada variável.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {missingSummary.slice(0, 6).map((m) => {
          const rawSample = Array.from(m.rawSamples)[0] || '<vazio>';
          const inferred = humanizeVarSource(rawSample, customFieldLabelByKey);
          const whereLabel = getWhereLabel(m.where, m.buttonIndex);
          const primary = inferred.label.startsWith('Valor')
            ? 'Variável ' + formatVarKeyForHumans(String(m.key))
            : inferred.label;
          const secondary = 'Onde: ' + whereLabel + ' - ' + formatVarKeyForHumans(String(m.key));

          return (
            <div
              key={m.where + ':' + (m.buttonIndex ?? '') + ':' + m.key}
              className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-lg p-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-[var(--ds-text-secondary)] truncate">
                    Precisa de: {primary}
                  </span>
                  <span className="text-[10px] text-amber-300">
                    afetou {m.count}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--ds-text-muted)] truncate">{secondary}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <QuickFillDropdown
                  item={m}
                  recipientSource={recipientSource}
                  customFields={customFields}
                  onApplyQuickFill={onApplyQuickFill}
                  onOpenFixedValueDialog={onOpenFixedValueDialog}
                />
              </div>
            </div>
          );
        })}

        {missingSummary.length > 6 && (
          <p className="text-[10px] text-[var(--ds-text-muted)]">
            Mostrando 6 de {missingSummary.length} pendências.
          </p>
        )}
      </div>
    </div>
  );
}
