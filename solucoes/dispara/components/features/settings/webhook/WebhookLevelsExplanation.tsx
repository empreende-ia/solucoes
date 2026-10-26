'use client';

import React, { useState } from 'react';
import { HelpCircle, ChevronUp, ChevronDown } from 'lucide-react';

export function WebhookLevelsExplanation() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-xl transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--ds-text-secondary)]">
          <HelpCircle size={16} className="text-[var(--ds-text-muted)]" />
          Entenda os 3 níveis de webhook
        </span>
        {isExpanded ? (
          <ChevronUp size={16} className="text-[var(--ds-text-muted)]" />
        ) : (
          <ChevronDown size={16} className="text-[var(--ds-text-muted)]" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 p-4 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl space-y-4 animate-in slide-in-from-top-2 duration-200">
          <p className="text-sm text-[var(--ds-text-secondary)]">
            A Meta verifica os webhooks nesta ordem. O primeiro que existir, ganha:
          </p>

          <div className="space-y-3">
            <div className="flex gap-3 p-3 bg-[var(--ds-status-success-bg)] border border-[var(--ds-status-success)]/20 rounded-lg">
              <div className="w-8 h-8 bg-[var(--ds-status-success)]/20 rounded-lg flex items-center justify-center text-[var(--ds-status-success-text)] font-bold text-sm shrink-0">
                #1
              </div>
              <div>
                <div className="font-medium text-[var(--ds-status-success-text)]">NÚMERO</div>
                <p className="text-xs text-[var(--ds-text-secondary)] mt-0.5">
                  Webhook específico deste número. Ignora os níveis abaixo.
                </p>
                <p className="text-xs text-[var(--ds-text-muted)] mt-1">
                  → Use quando: sistemas diferentes por número (IA, CRM, etc)
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-3 bg-[var(--ds-status-info-bg)] border border-[var(--ds-status-info)]/20 rounded-lg">
              <div className="w-8 h-8 bg-[var(--ds-status-info)]/20 rounded-lg flex items-center justify-center text-[var(--ds-status-info-text)] font-bold text-sm shrink-0">
                #2
              </div>
              <div>
                <div className="font-medium text-[var(--ds-status-info-text)]">WABA</div>
                <p className="text-xs text-[var(--ds-text-secondary)] mt-0.5">
                  Webhook para TODOS os números da sua conta comercial.
                </p>
                <p className="text-xs text-[var(--ds-text-muted)] mt-1">
                  → Use quando: 1 sistema para toda a empresa
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-3 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-lg">
              <div className="w-8 h-8 bg-[var(--ds-bg-elevated)] rounded-lg flex items-center justify-center text-[var(--ds-text-secondary)] font-bold text-sm shrink-0">
                #3
              </div>
              <div>
                <div className="font-medium text-[var(--ds-text-secondary)]">APP (Padrão)</div>
                <p className="text-xs text-[var(--ds-text-secondary)] mt-0.5">
                  Webhook configurado no Meta Developer Dashboard.
                </p>
                <p className="text-xs text-[var(--ds-text-muted)] mt-1">
                  → Fallback: usado se não tiver #1 nem #2
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
