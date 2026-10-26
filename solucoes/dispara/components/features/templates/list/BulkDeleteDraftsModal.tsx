'use client';

import React from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { Template } from '../../../../types';

export interface BulkDeleteDraftsModalProps {
  isOpen: boolean;
  drafts: Template[];
  isDeleting: boolean;
  onConfirm: (ids: string[]) => void;
  onCancel: () => void;
}

export const BulkDeleteDraftsModal: React.FC<BulkDeleteDraftsModalProps> = ({
  isOpen,
  drafts,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const draftIds = drafts.map((t) => t.id);

  const handleConfirm = () => {
    onConfirm(draftIds);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--ds-bg-elevated)] border border-amber-500/20 rounded-2xl w-full max-w-md p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)] animate-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-amber-500/10 rounded-xl">
            <Trash2 className="text-amber-300" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--ds-text-primary)]">Excluir rascunhos</h3>
            <p className="text-sm text-[var(--ds-text-secondary)]">
              Remove apenas rascunhos locais (nao apaga templates da Meta)
            </p>
          </div>
        </div>

        <div className="bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] rounded-lg p-4 mb-6">
          <p className="text-sm text-[var(--ds-text-secondary)] mb-3">
            Voce esta prestes a excluir{' '}
            <strong className="text-amber-300">{drafts.length} rascunho(s)</strong>.
          </p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {drafts.slice(0, 30).map((t) => (
              <div
                key={t.id}
                className="text-xs text-[var(--ds-text-secondary)] font-mono bg-[var(--ds-bg-surface)]/30 px-2 py-1 rounded border border-[var(--ds-border-subtle)]"
              >
                {t.name}
              </div>
            ))}
            {drafts.length > 30 ? (
              <div className="text-xs text-[var(--ds-text-muted)]">+{drafts.length - 30} item(ns)</div>
            ) : null}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 text-[var(--ds-text-secondary)] bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] hover:bg-[var(--ds-bg-hover)] rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting || draftIds.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-200 border border-amber-500/30 rounded-lg font-medium hover:bg-amber-500/15 transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Excluindo...
              </>
            ) : (
              <>
                <Trash2 size={16} /> Excluir {drafts.length}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
