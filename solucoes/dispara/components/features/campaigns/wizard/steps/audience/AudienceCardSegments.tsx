'use client';

import React from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { getPricingBreakdown } from '@/lib/whatsapp-pricing';
import { CheckCircleFilled } from '@/components/ui/icons/CheckCircleFilled';
import { AudienceCardSegmentsProps } from './types';

export function AudienceCardSegments({
  isSelected,
  subtitle,
  recipientCount,
  onSelect,
  selectedTemplate,
  exchangeRate,
}: AudienceCardSegmentsProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative p-6 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-4 h-full min-h-47.5 ${
        isSelected
          ? 'bg-primary-600 text-white dark:bg-white dark:text-black border-primary-500 dark:border-white shadow-[0_0_20px_rgba(var(--primary-rgb),0.10)] dark:shadow-[0_0_20px_rgba(255,255,255,0.10)] ring-2 ring-primary-500/70 dark:ring-white/70'
          : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-surface)] hover:border-[var(--ds-border-strong)] text-[var(--ds-text-secondary)]'
      }`}
    >
      {isSelected && (
        <div className="absolute top-3 right-3 text-white dark:text-black">
          <CheckCircleFilled size={20} />
        </div>
      )}

      <div
        className={`p-4 rounded-full ${
          isSelected ? 'bg-white/20 text-white dark:bg-slate-200 dark:text-black' : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
        }`}
      >
        <LinkIcon size={24} />
      </div>

      <div className="text-center">
        <h3 className="font-bold text-sm">Segmentos</h3>
        <p
          className={`text-xs mt-1 ${
            isSelected ? 'text-white/70 dark:text-slate-600' : 'text-[var(--ds-text-muted)]'
          }`}
        >
          {subtitle}
        </p>
        {isSelected && selectedTemplate ? (
          <p className="text-xs mt-2 font-bold text-primary-600">
            {
              getPricingBreakdown(
                selectedTemplate.category,
                recipientCount,
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
