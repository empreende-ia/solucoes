'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { CalendarStatusSectionProps } from './types';
import { Container } from '@/components/ui/container';
import { StatusBadge } from '@/components/ui/status-badge';

export function CalendarStatusSection({
  calendarAuthLoading,
  calendarAuthStatus,
  calendarTestLoading,
  calendarTestResult,
  handlePrimaryCalendarAction,
  handleCalendarTestEvent,
  setCalendarWizardStep,
  setCalendarWizardError,
  setIsCalendarWizardOpen,
}: CalendarStatusSectionProps) {
  return (
    <Container variant="subtle" padding="sm" className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Google Calendar</div>
          <div className="mt-1">
            {calendarAuthLoading ? (
              <span className="text-xs text-[var(--ds-text-secondary)]">Verificando...</span>
            ) : (
              <StatusBadge status={calendarAuthStatus?.connected ? 'success' : 'default'} showDot>
                {calendarAuthStatus?.connected ? 'Conectado' : 'Desconectado'}
              </StatusBadge>
            )}
          </div>
          {calendarAuthStatus?.calendar?.calendarSummary && (
            <div className="mt-2 text-xs text-[var(--ds-text-secondary)]">
              Calendário: {calendarAuthStatus.calendar.calendarSummary}
            </div>
          )}
          {calendarAuthStatus?.connected && (
            <div className="mt-2 text-xs text-[var(--ds-text-secondary)]">
              Conta: {calendarAuthStatus?.calendar?.accountEmail || 'não disponível'}
            </div>
          )}
          {calendarTestResult?.ok && calendarTestResult?.link && (
            <a
              href={calendarTestResult.link}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--ds-status-success-text)] hover:opacity-80"
            >
              <ExternalLink size={12} />
              Evento de teste criado
            </a>
          )}
          {calendarTestResult?.ok === false && (
            <div className="mt-2 text-xs text-red-400">
              Falha ao criar evento de teste.
            </div>
          )}
          {!calendarAuthStatus?.connected && (
            <div className="mt-2 text-xs text-[var(--ds-text-muted)]">
              Conecte uma vez para liberar o agendamento no WhatsApp.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrimaryCalendarAction}
            className="h-9 px-4 rounded-lg bg-primary-600 text-white hover:bg-primary-500 dark:bg-white dark:text-black dark:hover:bg-neutral-100 text-xs font-medium transition-colors"
          >
            {calendarAuthStatus?.connected ? 'Gerenciar conexão' : 'Conectar Google Calendar'}
          </button>
          {calendarAuthStatus?.connected && (
            <>
              <button
                type="button"
                onClick={() => {
                  setCalendarWizardStep(3);
                  setCalendarWizardError(null);
                  setIsCalendarWizardOpen(true);
                }}
                className="h-9 px-3 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-xs text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-surface)] transition-colors"
              >
                Trocar calendário
              </button>
              <button
                type="button"
                onClick={handleCalendarTestEvent}
                disabled={calendarTestLoading}
                className="h-9 px-3 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-xs text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-surface)] transition-colors disabled:opacity-50"
              >
                {calendarTestLoading ? 'Testando...' : 'Testar evento'}
              </button>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
