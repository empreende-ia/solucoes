'use client';

import React from 'react';
import type { PricingBreakdown } from './types';
import type { Template } from '@/types';

interface SummaryCardsProps {
  pricing: PricingBreakdown;
  recipientCount: number;
  selectedTemplate?: Template;
}

export function SummaryCards({
  pricing,
  recipientCount,
  selectedTemplate,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="p-5 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl">
        <p className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider mb-1">
          Custo Total
        </p>
        <p className="text-2xl font-bold text-[var(--ds-text-primary)]">{pricing.totalBRLFormatted}</p>
        {selectedTemplate && (
          <p className="text-xs text-[var(--ds-text-muted)] mt-1">
            {pricing.pricePerMessageBRLFormatted} × {recipientCount} msgs
          </p>
        )}
      </div>
      <div className="p-5 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl">
        <p className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider mb-1">
          Total Destinatários
        </p>
        <p className="text-2xl font-bold text-[var(--ds-text-primary)]">{recipientCount}</p>
      </div>
    </div>
  );
}
