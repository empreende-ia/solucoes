'use client';

import React from 'react';
import { Check, ExternalLink, RefreshCw } from 'lucide-react';
import type { WizardStepConnectProps } from './types';

export function WizardStepConnect({
  calendarCredsStatus,
  calendarAuthStatus,
  calendarConnectLoading,
  handleConnectCalendar,
  handleDisconnectCalendar,
  fetchCalendarAuthStatus,
}: WizardStepConnectProps) {
  const isConnected = calendarAuthStatus?.connected;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--ds-text-primary)]">Conectar conta Google</h2>
          <p className="mt-1 text-[var(--ds-text-secondary)]">Autorize o acesso ao Google Calendar.</p>
        </div>
        {isConnected && (
          <span className="flex items-center gap-1 text-sm text-[var(--ds-status-success-text)]">
            <Check size={16} /> Conectado
          </span>
        )}
      </div>

      <div className="p-6 rounded-lg bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)]">
        {isConnected ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--ds-status-success-bg)] flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-[var(--ds-status-success-text)]" />
            </div>
            <p className="font-medium text-[var(--ds-text-primary)]">Conta conectada</p>
            <p className="text-sm text-[var(--ds-text-secondary)] mt-1">{calendarAuthStatus?.calendar?.accountEmail}</p>

            <div className="flex justify-center gap-2 mt-4">
              <button type="button" onClick={fetchCalendarAuthStatus} className="h-9 px-3 rounded-lg border border-[var(--ds-border-default)] text-sm text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]">
                Verificar
              </button>
              <button type="button" onClick={handleDisconnectCalendar} className="h-9 px-3 rounded-lg border border-[var(--ds-status-error)]/30 text-sm text-[var(--ds-status-error-text)] hover:bg-[var(--ds-status-error-bg)]">
                Desconectar
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-[var(--ds-text-secondary)] mb-4">Clique para autorizar o acesso ao Calendar.</p>

            {!calendarCredsStatus?.isConfigured ? (
              <p className="text-sm text-[var(--ds-status-warning-text)]">Configure as credenciais primeiro.</p>
            ) : (
              <button
                type="button"
                onClick={handleConnectCalendar}
                disabled={calendarConnectLoading}
                className="h-10 px-6 rounded-lg bg-primary-600 text-white hover:bg-primary-500 dark:bg-white dark:text-black dark:hover:bg-neutral-100 font-medium disabled:opacity-50 inline-flex items-center gap-2"
              >
                {calendarConnectLoading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Conectando...</>
                ) : (
                  <><ExternalLink className="w-4 h-4" /> Conectar com Google</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
