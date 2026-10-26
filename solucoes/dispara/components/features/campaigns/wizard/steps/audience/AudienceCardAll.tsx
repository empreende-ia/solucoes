'use client';

import React from 'react';
import { Users, ShieldAlert } from 'lucide-react';
import { getPricingBreakdown } from '@/lib/whatsapp-pricing';
import { CheckCircleFilled } from '@/components/ui/icons/CheckCircleFilled';
import { AudienceCardAllProps } from './types';

export function AudienceCardAll({
  eligibleContactsCount,
  currentLimit,
  isSelected,
  onSelect,
  selectedTemplate,
  exchangeRate,
}: AudienceCardAllProps) {
  const isOverLimit = eligibleContactsCount > currentLimit;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative p-6 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-4 h-full min-h-47.5 ${
        isOverLimit
          ? 'bg-[var(--ds-bg-elevated)] border-red-500/30 text-[var(--ds-text-secondary)] opacity-60'
          : isSelected
            ? 'bg-primary-600 text-white dark:bg-white dark:text-black border-primary-600 dark:border-white shadow-lg ring-2 ring-primary-500/50 dark:ring-white/70'
            : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-surface)] hover:border-[var(--ds-border-strong)] text-[var(--ds-text-secondary)]'
      }`}
    >
      {isSelected && !isOverLimit && (
        <div className="absolute top-3 right-3 text-white dark:text-black">
          <CheckCircleFilled size={20} />
        </div>
      )}
      {isOverLimit && (
        <div className="absolute top-3 right-3 text-red-400">
          <ShieldAlert size={18} />
        </div>
      )}
      <div
        className={`p-4 rounded-full ${
          isOverLimit
            ? 'bg-red-500/20 text-red-400'
            : isSelected
              ? 'bg-white/20 text-white dark:bg-slate-200 dark:text-black'
              : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
        }`}
      >
        <Users size={24} />
      </div>
      <div className="text-center">
        <h3 className="font-bold text-sm">Todos</h3>
        <p
          className={`text-xs mt-1 ${
            isOverLimit ? 'text-red-400' : isSelected ? 'text-white/70 dark:text-slate-600' : 'text-[var(--ds-text-muted)]'
          }`}
        >
          {eligibleContactsCount} contatos • exclui opt-out e supressões
        </p>
        {isOverLimit ? (
          <p className="text-xs mt-2 font-bold text-red-400">
            Excede limite ({currentLimit})
          </p>
        ) : isSelected && selectedTemplate ? (
          <p className="text-xs mt-2 font-bold text-primary-300 dark:text-primary-600">
            {
              getPricingBreakdown(
                selectedTemplate.category,
                eligibleContactsCount,
                0,
                exchangeRate ?? 5.0
              ).totalBRLFormatted
            }
          </p>
        ) : null}
      </div>
    </button>
  );
}
