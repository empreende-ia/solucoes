'use client';

import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

export interface TurboActionsCardProps {
  onReset: () => void;
  isSaving?: boolean;
}

export function TurboActionsCard({
  onReset,
  isSaving,
}: TurboActionsCardProps) {
  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4 flex flex-col">
      <div className="text-xs text-[var(--ds-text-muted)] mb-2">Ações</div>
      <div className="flex-1 flex items-center">
        <button
          onClick={onReset}
          disabled={!!isSaving}
          className="h-9 px-3 bg-[var(--ds-bg-hover)] hover:bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] hover:border-[var(--ds-border-strong)] rounded-lg transition-all text-sm flex items-center gap-2 disabled:opacity-50 text-[var(--ds-text-primary)]"
          title="Reseta o targetMps para startMps"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Resetar aprendizado
        </button>
      </div>
    </div>
  );
}
