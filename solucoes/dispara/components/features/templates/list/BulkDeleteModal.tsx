'use client';

import React from 'react';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';

export interface BulkDeleteModalProps {
  isOpen: boolean;
  selectedNames: Set<string>;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  isOpen,
  selectedNames,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  const namesList = Array.from(selectedNames);

  return (
    <ConfirmDeleteModal
      isOpen={isOpen}
      title="Deletar Templates"
      itemsToDelete={namesList}
      count={selectedNames.size}
      isDeleting={isDeleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};
