'use client';

import React from 'react';
import { Clock, CheckCircle2, Eye, Ban, AlertCircle } from 'lucide-react';
import { MessageStatus } from '@/types';
import { DetailCard } from './DetailCard';
import { CampaignStatsGridProps } from './types';

export const CampaignStatsGrid: React.FC<CampaignStatsGridProps> = ({
  sentCount,
  deliveredTotal,
  readCount,
  skippedCount,
  failedCount,
  deliveredOnlyCount,
  recipients,
  hasLiveStats,
  filterStatus,
  setFilterStatus,
  setIncludeReadInDelivered,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <DetailCard
        title="Enviadas"
        value={Number(sentCount || 0).toLocaleString()}
        subvalue={`${recipients ?? 0} destinatários`}
        icon={Clock}
        color="#a1a1aa"
        isActive={filterStatus === MessageStatus.SENT}
        onClick={() => setFilterStatus?.(filterStatus === MessageStatus.SENT ? null : MessageStatus.SENT)}
      />
      <DetailCard
        title="Entregues"
        value={Number(deliveredTotal || 0).toLocaleString()}
        subvalue={(deliveredTotal || 0) > 0
          ? `${(((Number(deliveredTotal || 0)) / (recipients ?? 1)) * 100).toFixed(1)}% taxa de entrega${deliveredOnlyCount > 0 ? ` - ${Number(deliveredOnlyCount).toLocaleString()} nao lidas` : ''}`
          : (hasLiveStats ? 'Aguardando webhook' : 'Aguardando webhook')}
        icon={CheckCircle2}
        color="#10b981"
        isActive={filterStatus === MessageStatus.DELIVERED}
        onClick={() => {
          if (!setFilterStatus) return;

          const isActiveNow = filterStatus === MessageStatus.DELIVERED;
          if (isActiveNow) {
            setFilterStatus(null);
            return;
          }

          // Padrao "enterprise": KPI Entregues e cumulativo (delivered + read).
          // Ao clicar no card, abrimos a visao cumulativa para a lista bater com o numero.
          setFilterStatus(MessageStatus.DELIVERED);
          setIncludeReadInDelivered?.(true);
        }}
      />
      <DetailCard
        title="Lidas"
        value={Number(readCount || 0).toLocaleString()}
        subvalue={(readCount || 0) > 0
          ? `${(((Number(readCount || 0)) / (recipients ?? 1)) * 100).toFixed(1)}% taxa de abertura`
          : (hasLiveStats ? 'Aguardando webhook' : 'Aguardando webhook')}
        icon={Eye}
        color="#3b82f6"
        isActive={filterStatus === MessageStatus.READ}
        onClick={() => setFilterStatus?.(filterStatus === MessageStatus.READ ? null : MessageStatus.READ)}
      />
      <DetailCard
        title="Ignoradas"
        value={skippedCount.toLocaleString()}
        subvalue="Variáveis/telefones inválidos (pre-check)"
        icon={Ban}
        color="#f59e0b"
        isActive={filterStatus === MessageStatus.SKIPPED}
        onClick={() => setFilterStatus?.(filterStatus === MessageStatus.SKIPPED ? null : MessageStatus.SKIPPED)}
      />
      <DetailCard
        title="Falhas"
        value={Number(failedCount || 0).toLocaleString()}
        subvalue="Números inválidos ou bloqueio"
        icon={AlertCircle}
        color="#ef4444"
        isActive={filterStatus === MessageStatus.FAILED}
        onClick={() => setFilterStatus?.(filterStatus === MessageStatus.FAILED ? null : MessageStatus.FAILED)}
      />
    </div>
  );
};
