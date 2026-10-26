'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FixedValueDialogSlot } from './types';

interface FixedValueDialogProps {
  open: boolean;
  slot: FixedValueDialogSlot | null;
  title: string;
  value: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  onApply: (slot: FixedValueDialogSlot, value: string) => void;
}

export function FixedValueDialog({
  open,
  slot,
  title,
  value,
  onClose,
  onValueChange,
  onApply,
}: FixedValueDialogProps) {
  const handleApply = () => {
    const trimmedValue = value.trim();
    if (!trimmedValue || !slot) return;
    onApply(slot, trimmedValue);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--ds-text-primary)]">
            {title || 'Valor fixo (teste)'}
          </DialogTitle>
          <DialogDescription className="text-[var(--ds-text-secondary)]">
            Use isso só para testes rápidos. Esse valor vai apenas nesta campanha
            (não altera o contato).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ds-text-secondary)]">
            Digite o valor
          </label>
          <Input
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="Ex: Empresa Teste"
            className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
            autoFocus
            onKeyDown={handleKeyDown}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            className="bg-primary-600 text-white dark:bg-white dark:text-black hover:bg-primary-500 dark:hover:bg-slate-200 font-bold"
            disabled={!value.trim() || !slot}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
