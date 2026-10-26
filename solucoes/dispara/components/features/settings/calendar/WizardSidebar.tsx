'use client';

import React from 'react';
import { Check, ExternalLink, Calendar } from 'lucide-react';
import type { WizardSidebarProps } from './types';

const WIZARD_STEPS = [
  { id: 0, label: 'Inicio' },
  { id: 1, label: 'Credenciais' },
  { id: 2, label: 'Conectar' },
  { id: 3, label: 'Calendario' },
];

export function WizardSidebar({
  calendarWizardStep,
  calendarCredsStatus,
  calendarAuthStatus,
  handleCalendarWizardStepClick,
}: WizardSidebarProps) {
  const getStepStatus = (stepId: number) => {
    if (stepId === 0) return 'completed';
    if (stepId === 1) return calendarCredsStatus?.isConfigured ? 'completed' : 'pending';
    if (stepId === 2) return calendarAuthStatus?.connected ? 'completed' : 'pending';
    if (stepId === 3) return calendarAuthStatus?.calendar?.calendarId ? 'completed' : 'pending';
    return 'pending';
  };

  const isStepUnlocked = (stepId: number) => {
    if (stepId === 0 || stepId === 1) return true;
    if (stepId === 2) return !!calendarCredsStatus?.isConfigured;
    if (stepId === 3) return !!calendarAuthStatus?.connected;
    return false;
  };

  return (
    <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-6 lg:p-8">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[var(--ds-status-success-bg)] flex items-center justify-center">
          <Calendar className="w-5 h-5 text-[var(--ds-status-success-text)]" />
        </div>
        <div>
          <div className="text-sm font-medium text-[var(--ds-text-primary)]">Google Calendar</div>
          <div className="text-xs text-[var(--ds-text-muted)]">Configuração</div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {WIZARD_STEPS.map((step) => {
          const isActive = calendarWizardStep === step.id;
          const status = getStepStatus(step.id);
          const isUnlocked = isStepUnlocked(step.id);

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => handleCalendarWizardStepClick(step.id)}
              disabled={!isUnlocked}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                isActive
                  ? 'bg-[var(--ds-status-success-bg)] border border-[var(--ds-status-success)]/30'
                  : isUnlocked
                    ? 'hover:bg-[var(--ds-bg-hover)] border border-transparent'
                    : 'opacity-40 cursor-not-allowed border border-transparent'
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                status === 'completed' && !isActive
                  ? 'bg-[var(--ds-status-success)] text-white'
                  : isActive
                    ? 'bg-[var(--ds-status-success)]/30 text-[var(--ds-status-success-text)] border border-[var(--ds-status-success)]/50'
                    : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
              }`}>
                {status === 'completed' && !isActive ? (
                  <Check size={14} />
                ) : (
                  step.id + 1
                )}
              </span>
              <span className={`text-sm ${isActive ? 'text-[var(--ds-text-primary)] font-medium' : 'text-[var(--ds-text-secondary)]'}`}>
                {step.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Help */}
      <div className="mt-8 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] p-4">
        <div className="text-xs font-medium text-[var(--ds-text-primary)] mb-3">Ajuda rapida</div>
        <div className="space-y-2">
          <a
            href="https://developers.google.com/calendar/api/quickstart/js"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-[var(--ds-status-success-text)] hover:opacity-80 transition-colors"
          >
            <ExternalLink size={12} />
            Guia oficial do Google
          </a>
          <a
            href="https://www.youtube.com/results?search_query=google+calendar+oauth+setup"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-[var(--ds-status-success-text)] hover:opacity-80 transition-colors"
          >
            <ExternalLink size={12} />
            Videos tutoriais
          </a>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-[var(--ds-text-muted)]">
        Seu progresso fica salvo automaticamente.
      </p>
    </aside>
  );
}
