'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';

export function WizardStepChecklist() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--ds-text-primary)]">Vamos comecar!</h2>
        <p className="mt-2 text-[var(--ds-text-secondary)]">
          Em 3 passos voce conecta o Google Calendar e habilita agendamentos automaticos.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-4 p-4 rounded-lg bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)]">
          <div className="w-8 h-8 rounded-lg bg-[var(--ds-status-success-bg)] flex items-center justify-center text-[var(--ds-status-success-text)] font-medium text-sm flex-shrink-0">1</div>
          <div>
            <div className="font-medium text-[var(--ds-text-primary)]">Credenciais OAuth</div>
            <div className="text-sm text-[var(--ds-text-secondary)]">Crie um projeto no Google Cloud e obtenha Client ID e Secret.</div>
          </div>
        </div>

        <div className="flex gap-4 p-4 rounded-lg bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)]">
          <div className="w-8 h-8 rounded-lg bg-[var(--ds-status-success-bg)] flex items-center justify-center text-[var(--ds-status-success-text)] font-medium text-sm flex-shrink-0">2</div>
          <div>
            <div className="font-medium text-[var(--ds-text-primary)]">Conectar conta</div>
            <div className="text-sm text-[var(--ds-text-secondary)]">Autorize o Dispara a acessar seu Google Calendar.</div>
          </div>
        </div>

        <div className="flex gap-4 p-4 rounded-lg bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)]">
          <div className="w-8 h-8 rounded-lg bg-[var(--ds-status-success-bg)] flex items-center justify-center text-[var(--ds-status-success-text)] font-medium text-sm flex-shrink-0">3</div>
          <div>
            <div className="font-medium text-[var(--ds-text-primary)]">Escolher calendario</div>
            <div className="text-sm text-[var(--ds-text-secondary)]">Selecione qual calendario usar para os agendamentos.</div>
          </div>
        </div>
      </div>

      <a
        href="https://console.cloud.google.com/apis/credentials"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm text-[var(--ds-status-success-text)] hover:opacity-80"
      >
        <ExternalLink size={16} />
        Abrir Google Cloud Console
      </a>
    </div>
  );
}
