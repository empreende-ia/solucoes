'use client';

import React from 'react';
import { StatusBadge as DSStatusBadge } from '@/components/ui/status-badge';
import { TemplateStatus } from '../../../../types';

export interface StatusBadgeProps {
  status: TemplateStatus;
}

/**
 * Mapeia TemplateStatus para status do Design System
 */
const templateStatusToDS: Record<TemplateStatus, 'draft' | 'success' | 'warning' | 'error'> = {
  DRAFT: 'draft',
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
};

const labels: Record<TemplateStatus, string> = {
  DRAFT: 'Rascunho',
  APPROVED: 'Aprovado',
  PENDING: 'Em Análise',
  REJECTED: 'Rejeitado',
};

/**
 * StatusBadge para templates - wrapper do StatusBadge do DS
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  return (
    <DSStatusBadge status={templateStatusToDS[status]} size="sm" showDot>
      {labels[status]}
    </DSStatusBadge>
  );
};
