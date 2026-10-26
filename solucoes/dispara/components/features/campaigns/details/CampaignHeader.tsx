'use client';

import React from 'react';
import { ChevronLeft, Calendar, Loader2, Play, Pause, Ban, RefreshCw, Download } from 'lucide-react';
import { PrefetchLink } from '@/components/ui/PrefetchLink';
import { PageHeader, PageTitle } from '@/components/ui/page';
import { CampaignStatus } from '@/types';
import { CampaignHeaderProps } from './types';

export const CampaignHeader: React.FC<CampaignHeaderProps> = ({
  campaign,
  isRealtimeConnected,
  scheduledTimeDisplay,
  campaignStatusClass,
  canStart,
  onStart,
  isStarting,
  canCancelSchedule,
  onCancelSchedule,
  isCancelingSchedule,
  canCancelSend,
  onCancelSend,
  isCancelingSend,
  canPause,
  onPause,
  isPausing,
  canResume,
  onResume,
  isResuming,
  shouldShowRefreshButton,
  refetch,
  isRefreshing,
  skippedCount,
  onResendSkipped,
  isResendingSkipped,
  onShowTemplatePreview,
}) => {
  return (
    <PageHeader>
      <div className="min-w-0">
        <PrefetchLink
          href="/campaigns"
          className="text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] mb-2 inline-flex items-center gap-1 transition-colors"
        >
          <ChevronLeft size={12} /> Voltar para Lista
        </PrefetchLink>

        <div className="flex flex-wrap items-center gap-2">
          <PageTitle className="flex items-center gap-3">
            {campaign.name}
          </PageTitle>

          <span className={`text-xs px-2 py-1 rounded border ${campaignStatusClass}`}>
            {campaign.status}
          </span>

          {isRealtimeConnected && (
            <span className="inline-flex items-center gap-2 text-xs text-primary-400">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
              Ao vivo
            </span>
          )}
        </div>

        <p className="text-[var(--ds-text-secondary)] text-sm mt-1">
          ID: {campaign.id} - Criado em{' '}
          {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('pt-BR') : 'agora'}
          {campaign.templateName && (
            <button
              onClick={onShowTemplatePreview}
              className="ml-2 text-primary-400 hover:text-primary-300 transition-colors cursor-pointer"
            >
              - Template:{' '}
              <span className="font-medium underline underline-offset-2">{campaign.templateName}</span>
            </button>
          )}
          {scheduledTimeDisplay && campaign.status === CampaignStatus.SCHEDULED && (
            <span className="ml-2 text-violet-400">
              <Calendar size={12} className="inline mr-1" />
              Agendado para {scheduledTimeDisplay}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Start button for scheduled campaigns */}
        {canStart && (
          <button
            onClick={onStart}
            disabled={isStarting}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 border border-primary-500/20 rounded-lg text-white transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            {isStarting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {isStarting ? 'Iniciando...' : 'Iniciar Agora'}
          </button>
        )}

        {/* Cancel schedule (scheduled campaigns only) */}
        {canCancelSchedule && (
          <button
            onClick={onCancelSchedule}
            disabled={isCancelingSchedule}
            className="px-4 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
            title="Cancela o agendamento e volta a campanha para Rascunho"
          >
            {isCancelingSchedule ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {isCancelingSchedule ? 'Cancelando...' : 'Cancelar agendamento'}
          </button>
        )}

        {/* Cancel sending (sending/paused campaigns) */}
        {canCancelSend && (
          <button
            onClick={onCancelSend}
            disabled={isCancelingSend}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 border border-red-500/20 rounded-lg text-white transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
            title="Interrompe o envio e marca a campanha como Cancelada"
          >
            {isCancelingSend ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {isCancelingSend ? 'Cancelando...' : 'Cancelar envio'}
          </button>
        )}

        {/* Pause button for sending campaigns */}
        {canPause && (
          <button
            onClick={onPause}
            disabled={isPausing}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 border border-amber-500/20 rounded-lg text-white transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            {isPausing ? <Loader2 size={16} className="animate-spin" /> : <Pause size={16} />}
            {isPausing ? 'Pausando...' : 'Pausar'}
          </button>
        )}

        {/* Resume button for paused campaigns */}
        {canResume && (
          <button
            onClick={onResume}
            disabled={isResuming}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 border border-primary-500/20 rounded-lg text-white transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            {isResuming ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {isResuming ? 'Retomando...' : 'Retomar'}
          </button>
        )}

        {/* Refresh button - shown when realtime is disconnected for completed campaigns */}
        {shouldShowRefreshButton && (
          <button
            onClick={refetch}
            disabled={isRefreshing}
            className="px-4 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            {isRefreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        )}

        {/* Resend skipped */}
        {skippedCount > 0 && (
          <button
            onClick={onResendSkipped}
            disabled={!onResendSkipped || !!isResendingSkipped}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 border border-amber-500/20 rounded-lg text-white transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
            title="Revalida contatos ignorados e reenfileira apenas os validos"
          >
            {isResendingSkipped ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {isResendingSkipped ? 'Reenviando...' : `Reenviar ignorados (${skippedCount})`}
          </button>
        )}

        {/* Relatório CSV */}

        <a
          href={`/api/campaigns/${encodeURIComponent(campaign.id)}/report.csv`}
          download
          className="px-4 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-sm font-medium"
          title="Baixar relatório em CSV"
        >
          <Download size={16} /> Relatório CSV
        </a>
      </div>
    </PageHeader>
  );
};
