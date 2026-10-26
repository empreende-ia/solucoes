'use client';

import React from 'react';
import type { TestContact } from '@/types';

interface CampaignDetailsProps {
  name: string;
  selectedTemplateId: string;
  recipientSource: 'all' | 'specific' | 'test' | null;
  recipientCount: number;
  testContact?: TestContact;
  setStep: (step: number) => void;
}

export function CampaignDetails({
  name,
  selectedTemplateId,
  recipientSource,
  recipientCount,
  testContact,
  setStep,
}: CampaignDetailsProps) {
  const getAudienceLabel = () => {
    if (recipientSource === 'test') {
      return `🧪 Contato de Teste (${testContact?.name})`;
    }
    if (recipientSource === 'all') {
      return 'Todos os Contatos';
    }
    return 'Contatos Selecionados';
  };

  return (
    <div className="border-t border-[var(--ds-border-subtle)] pt-6 space-y-4">
      <h3 className="text-sm font-bold text-[var(--ds-text-primary)] mb-4">Detalhes da Campanha</h3>

      <div className="flex items-center justify-between group">
        <span className="text-sm text-[var(--ds-text-muted)]">Nome da Campanha</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--ds-text-primary)]">{name}</span>
          <button
            onClick={() => setStep(1)}
            className="opacity-0 group-hover:opacity-100 text-[var(--ds-text-muted)] hover:text-primary-400 transition-all"
          >
            <small>Editar</small>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between group">
        <span className="text-sm text-[var(--ds-text-muted)]">Template</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--ds-text-primary)] font-mono bg-[var(--ds-bg-elevated)] px-2 py-1 rounded">
            {selectedTemplateId}
          </span>
          <button
            onClick={() => setStep(1)}
            className="opacity-0 group-hover:opacity-100 text-[var(--ds-text-muted)] hover:text-primary-400 transition-all"
          >
            <small>Editar</small>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between group">
        <span className="text-sm text-[var(--ds-text-muted)]">Público</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--ds-text-primary)]">
            {getAudienceLabel()} ({recipientCount})
          </span>
          <button
            onClick={() => setStep(2)}
            className="opacity-0 group-hover:opacity-100 text-[var(--ds-text-muted)] hover:text-primary-400 transition-all"
          >
            <small>Editar</small>
          </button>
        </div>
      </div>
    </div>
  );
}
