'use client';

import React from 'react';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Template } from '../../../../types';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  template: Template | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  template,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  if (!template) return null;

  return (
    <ConfirmDeleteModal
      isOpen={isOpen}
      title="Deletar Template"
      itemName={template.name}
      isDeleting={isDeleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};
