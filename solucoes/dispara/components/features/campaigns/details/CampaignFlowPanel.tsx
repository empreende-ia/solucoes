'use client';

import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FormInput, ArrowUpRight, Users, Percent } from 'lucide-react';
import { PrefetchLink } from '@/components/ui/PrefetchLink';
import { onDbChangesStatus, subscribeToDbChanges } from '@/lib/supabase-realtime';
import { createRealtimeInvalidator } from '@/lib/realtime-invalidation';
import { REALTIME_FILTERS } from '@/lib/realtime-db-change';
import type { Campaign } from '@/types';

interface CampaignFlowPanelProps {
  campaign: Campaign;
}

/** Debounce do refetch da campanha a cada nova submissão (absorve rajadas). */
const SUBMISSIONS_REFETCH_WAIT_MS = 1000;
const SUBMISSIONS_REFETCH_MAX_WAIT_MS = 3000;

/**
 * Painel de métricas do Flow/MiniApp
 * Exibe informações sobre submissões de formulário quando a campanha usa um Flow
 * Com Realtime para atualização automática do contador
 */
export const CampaignFlowPanel: React.FC<CampaignFlowPanelProps> = ({ campaign }) => {
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);
  const hasFlow = !!campaign.flowId;
  // Contador SEMPRE da API autenticada (GET /api/campaigns/[id] conta as submissões)
  const submissionsCount = campaign.submissionsCount ?? 0;

  // Realtime para novas submissões (broadcast `dispara-db`: só id/campaign_id/flow_id,
  // nunca as respostas). O canal é público e aceita eventos forjados: o evento só
  // invalida a campanha (refetch com debounce); nunca soma +1 a partir do payload.
  useEffect(() => {
    if (!hasFlow) return;

    const invalidator = createRealtimeInvalidator(queryClient, {
      waitMs: SUBMISSIONS_REFETCH_WAIT_MS,
      maxWaitMs: SUBMISSIONS_REFETCH_MAX_WAIT_MS,
    });
    const unsubscribe = subscribeToDbChanges(
      () => {
        invalidator.invalidate(['campaign', campaign.id]);
      },
      { table: 'flow_submissions', event: 'INSERT', filter: REALTIME_FILTERS.flowSubmissionsByCampaign(campaign.id) }
    );
    const unsubscribeStatus = onDbChangesStatus((status) => {
      setIsLive(status === 'SUBSCRIBED');
    });

    return () => {
      unsubscribe();
      unsubscribeStatus();
      invalidator.cancel();
    };
  }, [campaign.id, hasFlow, queryClient]);

  // Só exibe se a campanha tem Flow (depois dos hooks: regra de hooks do React)
  if (!hasFlow) return null;

  const recipients = campaign.recipients ?? 0;

  // Calcula taxa de conversão (submissões / destinatários)
  const conversionRate = recipients > 0
    ? ((submissionsCount / recipients) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
            <FormInput size={20} className="text-primary-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[var(--ds-text-primary)]">MiniApp / Flow</h3>
              {isLive && (
                <span className="inline-flex items-center gap-1.5 text-xs text-primary-400">
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
                  Ao vivo
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--ds-text-secondary)]">{campaign.flowName || 'Formulário interativo'}</p>
          </div>
        </div>

        <PrefetchLink
          href={`/submissions?campaignId=${encodeURIComponent(campaign.id)}`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
        >
          Ver Submissões <ArrowUpRight size={14} />
        </PrefetchLink>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Submissões */}
        <div className="bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[var(--ds-text-secondary)] text-xs uppercase tracking-wide mb-2">
            <Users size={14} />
            Respostas
          </div>
          <div className="text-2xl font-bold text-[var(--ds-text-primary)]">
            {submissionsCount.toLocaleString('pt-BR')}
          </div>
          <p className="text-xs text-[var(--ds-text-muted)] mt-1">
            {submissionsCount === 1 ? 'pessoa respondeu' : 'pessoas responderam'}
          </p>
        </div>

        {/* Taxa de Conversão */}
        <div className="bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[var(--ds-text-secondary)] text-xs uppercase tracking-wide mb-2">
            <Percent size={14} />
            Taxa de Resposta
          </div>
          <div className="text-2xl font-bold text-[var(--ds-text-primary)]">
            {conversionRate}%
          </div>
          <p className="text-xs text-[var(--ds-text-muted)] mt-1">
            de {recipients.toLocaleString('pt-BR')} destinatários
          </p>
        </div>
      </div>

      {/* Dica quando não há submissões */}
      {submissionsCount === 0 && (
        <p className="text-xs text-[var(--ds-text-muted)] mt-4 text-center">
          Aguardando respostas do formulário...
        </p>
      )}
    </div>
  );
};
