'use client';

import React from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TemplateListHeaderProps {
  templateCount: number;
  isSyncing: boolean;
  onSync: () => void;
  onOpenBulkModal: () => void;
}

export const TemplateListHeader: React.FC<TemplateListHeaderProps> = ({
  templateCount,
  isSyncing,
  onSync,
  onOpenBulkModal,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-[var(--ds-text-primary)] tracking-tight mb-2">Templates</h1>
        <p className="text-[var(--ds-text-secondary)]">Gerencie seus modelos de mensagens aprovados pelo WhatsApp</p>
      </div>
      <div className="flex gap-3">
        {/* USAGE LIMIT INDICATOR */}
        <div className="flex flex-col items-end justify-center mr-4 px-3 py-1 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-lg">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--ds-text-secondary)]">
            <span>Uso da Conta</span>
            <span className={`${templateCount >= 250 ? 'text-amber-300' : 'text-primary-300'}`}>
              {templateCount} / 250
            </span>
          </div>
          <div className="w-32 h-1.5 bg-[var(--ds-bg-surface)] rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                templateCount >= 250
                  ? 'bg-amber-500'
                  : templateCount >= 200
                    ? 'bg-amber-400'
                    : 'bg-primary-500'
              }`}
              style={{ width: `${Math.min((templateCount / 250) * 100, 100)}%` }}
            />
          </div>
        </div>

        <Button
          variant="brand"
          onClick={onOpenBulkModal}
          aria-label="Gerar templates de utilidade em massa"
        >
          <Zap size={18} aria-hidden="true" />
          Gerar UTILIDADE em Massa
        </Button>
        <Button
          variant="outline"
          onClick={onSync}
          disabled={isSyncing}
          aria-label={isSyncing ? 'Sincronizando templates com WhatsApp' : 'Sincronizar templates com WhatsApp'}
        >
          <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </Button>
      </div>
    </div>
  );
};
