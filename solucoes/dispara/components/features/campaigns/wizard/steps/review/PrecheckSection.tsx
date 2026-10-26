'use client';

import React from 'react';
import { CheckCircle, RefreshCw, ShieldAlert, Wand2 } from 'lucide-react';
import type { CustomFieldDefinition } from '@/types';
import type { QuickEditFocus } from '@/hooks/campaigns/useCampaignWizardUI';
import type {
  PrecheckResult,
  MissingSummaryItem,
  BatchFixCandidate,
  FixedValueDialogSlot,
} from './types';
import { QuickAdjustments } from './QuickAdjustments';
import { SkippedContactsTable } from './SkippedContactsTable';

interface PrecheckSectionProps {
  recipientSource: 'all' | 'specific' | 'test' | null;
  isPrechecking?: boolean;
  isEnsuringTestContact?: boolean;
  precheckResult?: PrecheckResult | null;
  handlePrecheck: () => void | Promise<unknown>;
  // Missing summary
  missingSummary: MissingSummaryItem[];
  customFieldLabelByKey: Record<string, string>;
  customFields: CustomFieldDefinition[];
  // Batch fix
  batchFixCandidates: BatchFixCandidate[];
  startBatchFix: () => void;
  // Quick edit
  quickEditContactId: string | null;
  setQuickEditContactId: (id: string | null) => void;
  setQuickEditFocusSafe: (focus: QuickEditFocus) => void;
  // Batch fix queue
  setBatchFixQueue: (queue: BatchFixCandidate[]) => void;
  setBatchFixIndex: (index: number) => void;
  batchNextRef: React.MutableRefObject<BatchFixCandidate | null>;
  batchCloseReasonRef: React.MutableRefObject<'advance' | 'finish' | null>;
  // Quick fill
  onApplyQuickFill: (slot: FixedValueDialogSlot, value: string) => void;
  onOpenFixedValueDialog: (slot: FixedValueDialogSlot) => void;
}

export function PrecheckSection({
  recipientSource,
  isPrechecking,
  isEnsuringTestContact,
  precheckResult,
  handlePrecheck,
  missingSummary,
  customFieldLabelByKey,
  customFields,
  batchFixCandidates,
  startBatchFix,
  quickEditContactId,
  setQuickEditContactId,
  setQuickEditFocusSafe,
  setBatchFixQueue,
  setBatchFixIndex,
  batchNextRef,
  batchCloseReasonRef,
  onApplyQuickFill,
  onOpenFixedValueDialog,
}: PrecheckSectionProps) {
  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-primary-400" />
          <h3 className="text-sm font-bold text-[var(--ds-text-primary)]">
            Pré-check de destinatários
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {recipientSource !== 'test' && batchFixCandidates.length > 0 && (
            <button
              type="button"
              onClick={startBatchFix}
              disabled={!!isPrechecking || !!quickEditContactId}
              className={
                'px-4 py-2 rounded-lg text-sm font-bold border transition-colors flex items-center gap-2 ' +
                (!!isPrechecking || !!quickEditContactId
                  ? 'bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-muted)]'
                  : 'bg-primary-600 text-white border-primary-500/40 hover:bg-primary-500')
              }
              title="Corrigir contatos ignorados em sequência (sem sair da campanha)"
            >
              <Wand2 size={14} /> Corrigir em lote ({batchFixCandidates.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => handlePrecheck()}
            disabled={
              !!isPrechecking ||
              (!!isEnsuringTestContact && recipientSource === 'test')
            }
            className={
              'px-4 py-2 rounded-lg text-sm font-bold border transition-colors flex items-center gap-2 ' +
              (isPrechecking
                ? 'bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]'
                : 'bg-primary-600 text-white dark:bg-white dark:text-black border-primary-500 dark:border-white hover:bg-primary-500 dark:hover:bg-slate-200')
            }
            title="Valida telefones + variáveis do template sem criar campanha"
          >
            {isPrechecking ? (
              <>
                <RefreshCw size={14} className="animate-spin" /> Validando...
              </>
            ) : (
              <>
                <CheckCircle size={14} /> Validar agora
              </>
            )}
          </button>

          {recipientSource === 'test' && isEnsuringTestContact && (
            <span className="text-[11px] text-[var(--ds-text-muted)]">
              Preparando contato de teste...
            </span>
          )}
        </div>
      </div>

      {precheckResult?.totals && (
        <div className="mt-3 text-xs text-[var(--ds-text-secondary)] space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-primary-400 font-bold">
              Válidos: {precheckResult.totals.valid}
            </span>
            <span className="text-amber-400 font-bold">
              Serão ignorados: {precheckResult.totals.skipped}
            </span>
            <span className="text-[var(--ds-text-muted)]">
              Total: {precheckResult.totals.total}
            </span>
          </div>

          <QuickAdjustments
            missingSummary={missingSummary}
            customFieldLabelByKey={customFieldLabelByKey}
            recipientSource={recipientSource}
            customFields={customFields}
            onApplyQuickFill={onApplyQuickFill}
            onOpenFixedValueDialog={onOpenFixedValueDialog}
          />

          {precheckResult.totals.skipped > 0 && (
            <SkippedContactsTable
              results={precheckResult.results}
              totalSkipped={precheckResult.totals.skipped}
              recipientSource={recipientSource}
              customFieldLabelByKey={customFieldLabelByKey}
              setBatchFixQueue={setBatchFixQueue}
              setBatchFixIndex={setBatchFixIndex}
              batchNextRef={batchNextRef}
              batchCloseReasonRef={batchCloseReasonRef}
              setQuickEditContactId={setQuickEditContactId}
              setQuickEditFocusSafe={setQuickEditFocusSafe}
            />
          )}
        </div>
      )}
    </div>
  );
}
