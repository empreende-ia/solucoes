'use client';

import React from 'react';
import { Loader2, Eye, CheckCircle2, Clock, Ban, AlertCircle } from 'lucide-react';
import { MessageStatus } from '@/types';

interface MessageStatusBadgeProps {
  status: MessageStatus;
}

export const MessageStatusBadge: React.FC<MessageStatusBadgeProps> = ({ status }) => {
  const styles: Record<string, string> = {
    [MessageStatus.PENDING]: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    [MessageStatus.READ]: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    [MessageStatus.DELIVERED]: 'text-primary-400 bg-primary-500/10 border-primary-500/20',
    [MessageStatus.SENT]: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    [MessageStatus.SKIPPED]: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
    [MessageStatus.FAILED]: 'text-red-400 bg-red-500/10 border-red-500/20',
    // Fallback para valores antigos em ingles
    'Pending': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Read': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    'Delivered': 'text-primary-400 bg-primary-500/10 border-primary-500/20',
    'Sent': 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    'Failed': 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  const icons: Record<string, React.ReactNode> = {
    [MessageStatus.PENDING]: <Loader2 size={12} className="mr-1 animate-spin" />,
    [MessageStatus.READ]: <Eye size={12} className="mr-1" />,
    [MessageStatus.DELIVERED]: <CheckCircle2 size={12} className="mr-1" />,
    [MessageStatus.SENT]: <Clock size={12} className="mr-1" />,
    [MessageStatus.SKIPPED]: <Ban size={12} className="mr-1" />,
    [MessageStatus.FAILED]: <AlertCircle size={12} className="mr-1" />,
    // Fallback para valores antigos em ingles
    'Pending': <Loader2 size={12} className="mr-1 animate-spin" />,
    'Read': <Eye size={12} className="mr-1" />,
    'Delivered': <CheckCircle2 size={12} className="mr-1" />,
    'Sent': <Clock size={12} className="mr-1" />,
    'Failed': <AlertCircle size={12} className="mr-1" />,
  };

  // Mapa de traducao para garantir exibicao em PT-BR
  const labels: Record<string, string> = {
    [MessageStatus.PENDING]: 'Pendente',
    [MessageStatus.READ]: 'Lido',
    [MessageStatus.DELIVERED]: 'Entregue',
    [MessageStatus.SENT]: 'Enviado',
    [MessageStatus.SKIPPED]: 'Ignorado',
    [MessageStatus.FAILED]: 'Falhou',
    // Fallback para valores antigos em ingles
    'Pending': 'Pendente',
    'Read': 'Lido',
    'Delivered': 'Entregue',
    'Sent': 'Enviado',
    'Failed': 'Falhou',
  };

  const style = styles[status] || 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  const icon = icons[status] || <Clock size={12} className="mr-1" />;
  const label = labels[status] || status;

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${style}`}>
      {icon} {label}
    </span>
  );
};
