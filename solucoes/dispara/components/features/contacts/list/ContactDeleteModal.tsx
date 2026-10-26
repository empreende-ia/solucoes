'use client';

import React from 'react';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { DeleteTarget } from './types';
import { Container } from '@/components/ui/container';

export interface ContactDeleteModalProps {
  isOpen: boolean;
  deleteTarget: DeleteTarget | null;
  selectedCount: number;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ContactDeleteModal: React.FC<ContactDeleteModalProps> = ({
  isOpen,
  deleteTarget,
  selectedCount,
  isDeleting,
  onConfirm,
  onCancel
}) => {
  if (!isOpen || !deleteTarget) return null;

  const isBulkDelete = deleteTarget.type === 'bulk';
  const message = isBulkDelete
    ? `Tem certeza que deseja excluir ${selectedCount} contatos? Esta ação não pode ser desfeita.`
    : 'Tem certeza que deseja excluir este contato? Esta ação não pode ser desfeita.';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Container variant="surface" padding="lg" className="w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-[var(--ds-text-primary)] mb-2">Confirmar Exclusão</h2>
          <p className="text-[var(--ds-text-secondary)] mb-6">{message}</p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] font-medium py-3 rounded-xl hover:bg-[var(--ds-bg-hover)] transition-colors"
              disabled={isDeleting}
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-400 transition-colors flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Excluindo...
                </>
              ) : (
                <>
                  <Trash2 size={18} /> Excluir
                </>
              )}
            </button>
          </div>
        </div>
      </Container>
    </div>
  );
};
