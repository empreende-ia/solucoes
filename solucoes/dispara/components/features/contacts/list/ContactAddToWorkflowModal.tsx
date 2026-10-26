'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Clock, Loader2, Workflow } from 'lucide-react';
import type { WorkflowSummary } from '@/services/workflowEnrollmentService';

export interface ContactAddToWorkflowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  /** Workflows publicados (únicos que aceitam inscrição em massa) */
  workflows: WorkflowSummary[];
  isLoadingWorkflows?: boolean;
  onConfirm: (workflowId: string) => void;
  isEnrolling?: boolean;
}

/**
 * Modal de inscrição em massa num workflow publicado — o "Add to Workflow" do GHL.
 */
export function ContactAddToWorkflowModal({
  open,
  onOpenChange,
  selectedCount,
  workflows,
  isLoadingWorkflows,
  onConfirm,
  isEnrolling,
}: ContactAddToWorkflowModalProps) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setSelectedWorkflowId(null);
    onOpenChange(isOpen);
  };

  const handleConfirm = () => {
    if (!selectedWorkflowId) return;
    onConfirm(selectedWorkflowId);
  };

  const hasPublished = workflows.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow size={18} aria-hidden="true" />
            Adicionar ao workflow — {selectedCount} contato{selectedCount !== 1 ? 's' : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isLoadingWorkflows ? (
            <div className="flex items-center gap-2 text-sm text-[var(--ds-text-muted)] py-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Carregando workflows...
            </div>
          ) : hasPublished ? (
            <>
              <Select
                value={selectedWorkflowId ?? ''}
                onValueChange={(v) => setSelectedWorkflowId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o workflow..." />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((workflow) => (
                    <SelectItem key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-start gap-2 rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm text-[var(--ds-text-secondary)]">
                <Clock size={16} className="mt-0.5 shrink-0 text-[var(--ds-text-muted)]" aria-hidden="true" />
                <span>
                  A inscrição é processada em segundo plano
                  (<strong>~25 contatos por minuto</strong>). Contatos que já estão
                  no fluxo não entram de novo.
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Nenhum workflow publicado. Publique um workflow no builder antes
                de adicionar contatos.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isEnrolling}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedWorkflowId || !hasPublished || isEnrolling}
          >
            {isEnrolling ? 'Adicionando...' : 'Adicionar ao workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
