import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ds/dialog';
import { Button } from '@/components/ds/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Confirmação padrão — substitui window.confirm(). Modal central é reservado a isto. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
  onConfirm,
}) => (
  <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
    <DialogContent className="max-w-sm gap-3">
      <DialogHeader>
        <DialogTitle className="text-base">{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <DialogFooter className="mt-2 gap-2 sm:gap-2">
        <Button variant="ghost" size="sm" disabled={loading} onClick={() => onOpenChange(false)}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'destructive' : 'default'}
          size="sm"
          disabled={loading}
          onClick={() => void onConfirm()}
        >
          {loading ? 'Aguarde…' : confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default ConfirmDialog;
