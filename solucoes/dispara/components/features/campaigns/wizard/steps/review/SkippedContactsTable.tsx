'use client';

import React from 'react';
import { humanizePrecheckReason } from '@/lib/precheck-humanizer';
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter';
import type { QuickEditFocus } from '@/hooks/campaigns/useCampaignWizardUI';
import type { PrecheckResultItem, BatchFixCandidate } from './types';

interface SkippedContactsTableProps {
  results: PrecheckResultItem[];
  totalSkipped: number;
  recipientSource: 'all' | 'specific' | 'test' | null;
  customFieldLabelByKey: Record<string, string>;
  // Batch fix controls
  setBatchFixQueue: (queue: BatchFixCandidate[]) => void;
  setBatchFixIndex: (index: number) => void;
  batchNextRef: React.MutableRefObject<BatchFixCandidate | null>;
  batchCloseReasonRef: React.MutableRefObject<'advance' | 'finish' | null>;
  setQuickEditContactId: (id: string | null) => void;
  setQuickEditFocusSafe: (focus: QuickEditFocus) => void;
}

export function SkippedContactsTable({
  results,
  totalSkipped,
  recipientSource,
  customFieldLabelByKey,
  setBatchFixQueue,
  setBatchFixIndex,
  batchNextRef,
  batchCloseReasonRef,
  setQuickEditContactId,
  setQuickEditFocusSafe,
}: SkippedContactsTableProps) {
  const skippedResults = results.filter((r) => !r.ok).slice(0, 20);

  const handleFixContact = (item: PrecheckResultItem) => {
    // If user opened manually, end any batch
    setBatchFixQueue([]);
    setBatchFixIndex(0);
    batchNextRef.current = null;
    batchCloseReasonRef.current = null;

    const h = humanizePrecheckReason(
      String(item.reason || item.skipCode || ''),
      { customFieldLabelByKey }
    );
    setQuickEditContactId(item.contactId!);
    setQuickEditFocusSafe((h.focus as QuickEditFocus) || null);
  };

  return (
    <details className="bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg p-3">
      <summary className="cursor-pointer text-[var(--ds-text-secondary)] font-medium">
        Ver ignorados (motivo + ação)
      </summary>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase tracking-wider text-[var(--ds-text-muted)]">
            <tr>
              <th className="py-2 pr-3">Contato</th>
              <th className="py-2 pr-3">Telefone</th>
              <th className="py-2 pr-3">Motivo</th>
              <th className="py-2 pr-3">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ds-border-subtle)]">
            {skippedResults.map((r, idx) => {
              const h = humanizePrecheckReason(
                String(r.reason || r.skipCode || ''),
                { customFieldLabelByKey }
              );
              return (
                <tr key={r.phone + '_' + idx}>
                  <td className="py-2 pr-3 text-[var(--ds-text-secondary)]">{r.name}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-[var(--ds-text-muted)]">
                    {formatPhoneNumberDisplay(r.normalizedPhone || r.phone, 'e164')}
                  </td>
                  <td className="py-2 pr-3">
                    <div>
                      <p className="text-amber-200/90">{h.title}</p>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    {r.contactId && recipientSource !== 'test' ? (
                      <button
                        type="button"
                        onClick={() => handleFixContact(r)}
                        className="text-primary-400 hover:text-primary-300 underline underline-offset-2"
                      >
                        Corrigir contato
                      </button>
                    ) : (
                      <span className="text-[var(--ds-text-muted)]">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totalSkipped > 20 && (
          <p className="mt-2 text-[10px] text-[var(--ds-text-muted)]">
            Mostrando 20 de {totalSkipped} ignorados.
          </p>
        )}
      </div>
    </details>
  );
}
