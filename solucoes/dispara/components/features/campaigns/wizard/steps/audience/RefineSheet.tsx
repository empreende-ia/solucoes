'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RefineSheetProps } from './types';

export function RefineSheet({
  audienceDraft,
  setAudienceDraft,
  audienceCriteria,
  applyAudienceCriteria,
  recipientSource,
  onClose,
  onOpenSegments,
}: RefineSheetProps) {
  const isDisabled = recipientSource === 'test';

  const handleClear = () => {
    setAudienceDraft({
      status: 'OPT_IN',
      includeTag: audienceCriteria?.includeTag ?? null,
      createdWithinDays: null,
      excludeOptOut: true,
      noTags: false,
      uf: audienceCriteria?.uf ?? null,
    });
  };

  const handleApply = () => {
    applyAudienceCriteria?.(
      {
        ...audienceDraft,
        includeTag: audienceCriteria?.includeTag ?? null,
        uf: audienceCriteria?.uf ?? null,
        ddi: audienceCriteria?.ddi ?? null,
        customFieldKey: audienceCriteria?.customFieldKey ?? null,
        customFieldMode: audienceCriteria?.customFieldMode ?? null,
        customFieldValue: audienceCriteria?.customFieldValue ?? null,
      },
      'manual'
    );
    onClose();
  };

  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-2xl p-5 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--ds-text-primary)]">Ajustar status/recência</p>
          <p className="text-xs text-[var(--ds-text-muted)]">
            Ajuste fino (status, sem tags, recência). Para Tag/UF, use Segmentos.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-5 space-y-6">
        {/* Status */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--ds-text-muted)] uppercase tracking-wider">
            Status
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={audienceDraft.status === 'OPT_IN' ? 'default' : 'outline'}
              className={
                audienceDraft.status === 'OPT_IN'
                  ? 'bg-primary-600 text-white hover:bg-primary-500'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
              }
              onClick={() =>
                setAudienceDraft((d) => ({ ...d, status: 'OPT_IN' }))
              }
            >
              Opt-in
            </Button>
            <Button
              type="button"
              variant={audienceDraft.status === 'ALL' ? 'default' : 'outline'}
              className={
                audienceDraft.status === 'ALL'
                  ? 'bg-primary-600 text-white hover:bg-primary-500'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
              }
              onClick={() =>
                setAudienceDraft((d) => ({ ...d, status: 'ALL' }))
              }
            >
              Todos
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)]">
            <input
              type="checkbox"
              checked
              disabled
              className="w-4 h-4 text-primary-600 bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] rounded"
            />
            Opt-out sempre excluído (regra do WhatsApp)
          </label>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-[var(--ds-text-muted)] uppercase tracking-wider">
              Tags
            </p>
            <button
              type="button"
              className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
              onClick={onOpenSegments}
              disabled={isDisabled}
            >
              Abrir Segmentos
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)]">
            <input
              type="checkbox"
              checked={!!audienceDraft.noTags}
              onChange={(e) =>
                setAudienceDraft((d) => ({ ...d, noTags: e.target.checked }))
              }
              className="w-4 h-4 text-primary-600 bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] rounded"
            />
            Somente contatos sem tags
          </label>
          <p className="text-xs text-[var(--ds-text-muted)]">
            Escolha Tag/UF em{' '}
            <span className="text-[var(--ds-text-secondary)]">Segmentos</span> (com contagem por
            opção).
          </p>
        </div>

        {/* Criados nos últimos */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--ds-text-muted)] uppercase tracking-wider">
            Criados nos últimos
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={audienceDraft.createdWithinDays === 7 ? 'default' : 'outline'}
              className={
                audienceDraft.createdWithinDays === 7
                  ? 'bg-primary-600 text-white hover:bg-primary-500'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
              }
              onClick={() =>
                setAudienceDraft((d) => ({ ...d, createdWithinDays: 7 }))
              }
            >
              7 dias
            </Button>
            <Button
              type="button"
              variant={audienceDraft.createdWithinDays === 30 ? 'default' : 'outline'}
              className={
                audienceDraft.createdWithinDays === 30
                  ? 'bg-primary-600 text-white hover:bg-primary-500'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
              }
              onClick={() =>
                setAudienceDraft((d) => ({ ...d, createdWithinDays: 30 }))
              }
            >
              30 dias
            </Button>
            <Button
              type="button"
              variant={!audienceDraft.createdWithinDays ? 'default' : 'outline'}
              className={
                !audienceDraft.createdWithinDays
                  ? 'bg-primary-600 text-white hover:bg-primary-500'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
              }
              onClick={() =>
                setAudienceDraft((d) => ({ ...d, createdWithinDays: null }))
              }
            >
              Todos
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 w-full">
        <Button
          type="button"
          variant="outline"
          className="border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
          onClick={handleClear}
        >
          Limpar
        </Button>
        <Button
          type="button"
          className="bg-primary-600 text-white hover:bg-primary-500"
          onClick={handleApply}
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}
