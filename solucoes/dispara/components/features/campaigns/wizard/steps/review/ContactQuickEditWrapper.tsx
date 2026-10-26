'use client';

import React from 'react';
import { ContactQuickEditModal } from '@/components/features/contacts/ContactQuickEditModal';
import type { ContactFixFocus } from '@/lib/precheck-humanizer';
import type { QuickEditFocus } from '@/hooks/campaigns/useCampaignWizardUI';
import type { BatchFixCandidate } from './types';

interface ContactQuickEditWrapperProps {
  quickEditContactId: string | null;
  quickEditFocus: QuickEditFocus;
  setQuickEditContactId: (id: string | null) => void;
  setQuickEditFocusSafe: (focus: QuickEditFocus) => void;
  // Batch fix
  batchFixQueue: BatchFixCandidate[];
  batchFixIndex: number;
  setBatchFixQueue: (queue: BatchFixCandidate[]) => void;
  setBatchFixIndex: (index: number | ((prev: number) => number)) => void;
  batchNextRef: React.MutableRefObject<BatchFixCandidate | null>;
  batchCloseReasonRef: React.MutableRefObject<'advance' | 'finish' | null>;
  handlePrecheck: () => void | Promise<unknown>;
}

export function ContactQuickEditWrapper({
  quickEditContactId,
  quickEditFocus,
  setQuickEditContactId,
  setQuickEditFocusSafe,
  batchFixQueue,
  batchFixIndex,
  setBatchFixQueue,
  setBatchFixIndex,
  batchNextRef,
  batchCloseReasonRef,
  handlePrecheck,
}: ContactQuickEditWrapperProps) {
  const handleSaved = () => {
    if (!batchFixQueue.length) return;

    const next = batchFixQueue[batchFixIndex + 1];
    if (next) {
      batchNextRef.current = next;
      batchCloseReasonRef.current = 'advance';
      setBatchFixIndex((i) => i + 1);
      return;
    }

    batchNextRef.current = null;
    batchCloseReasonRef.current = 'finish';
  };

  const handleClose = () => {
    const reason = batchCloseReasonRef.current;
    batchCloseReasonRef.current = null;

    if (reason === 'advance') {
      const next = batchNextRef.current;
      batchNextRef.current = null;
      if (next) {
        setQuickEditContactId(next.contactId);
        setQuickEditFocusSafe(next.focus);
        return;
      }
    }

    if (reason === 'finish') {
      // End batch and revalidate
      setBatchFixQueue([]);
      setBatchFixIndex(0);
      setQuickEditContactId(null);
      setQuickEditFocusSafe(null);
      void Promise.resolve(handlePrecheck());
      return;
    }

    // Manual close/cancel
    setBatchFixQueue([]);
    setBatchFixIndex(0);
    batchNextRef.current = null;
    setQuickEditContactId(null);
    setQuickEditFocusSafe(null);
  };

  const title =
    batchFixQueue.length > 0
      ? 'Corrigir contato (' +
        Math.min(batchFixIndex + 1, batchFixQueue.length) +
        ' de ' +
        batchFixQueue.length +
        ')'
      : 'Corrigir contato';

  return (
    <ContactQuickEditModal
      isOpen={!!quickEditContactId}
      contactId={quickEditContactId}
      onSaved={handleSaved}
      onClose={handleClose}
      focus={quickEditFocus as ContactFixFocus}
      mode={quickEditFocus ? 'focused' : 'full'}
      title={title}
    />
  );
}
