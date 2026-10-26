'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SelectionActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDeleteClick: () => void;
}

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({
  selectedCount,
  onClearSelection,
  onBulkDeleteClick,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="rounded-2xl border border-primary-400/30 bg-primary-500/10 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)] flex items-center justify-between animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-3">
        <span className="text-sm text-primary-200 font-medium">
          {selectedCount} selecionado(s)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          Cancelar
        </Button>
        <Button variant="outline" size="sm" onClick={onBulkDeleteClick}>
          <Trash2 size={16} />
          Deletar {selectedCount}
        </Button>
      </div>
    </div>
  );
};
