'use client';

import React from 'react';
import { ExternalLink, Check } from 'lucide-react';
import type { WizardStepCredentialsProps } from './types';

export function WizardStepCredentials({
  calendarCredsStatus,
  calendarCredsLoading,
  calendarCredsSaving,
  calendarClientIdDraft,
  calendarClientSecretDraft,
  calendarBaseUrl,
  calendarBaseUrlDraft,
  calendarBaseUrlEditing,
  calendarRedirectUrl,
  calendarClientIdValid,
  calendarClientSecretValid,
  calendarCredsFormValid,
  calendarCredsSourceLabel,
  setCalendarClientIdDraft,
  setCalendarClientSecretDraft,
  setCalendarBaseUrlDraft,
  setCalendarBaseUrlEditing,
  handleSaveCalendarCreds,
  handleRemoveCalendarCreds,
  handleCopyCalendarValue,
}: WizardStepCredentialsProps) {
  if (calendarCredsLoading) {
    return <div className="text-[var(--ds-text-secondary)]">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--ds-text-primary)]">Credenciais OAuth</h2>
          <p className="mt-1 text-[var(--ds-text-secondary)]">Cole o Client ID e Client Secret do Google Cloud.</p>
        </div>
        {calendarCredsStatus?.isConfigured && (
          <span className="flex items-center gap-1 text-sm text-[var(--ds-status-success-text)]">
            <Check size={16} /> Configurado
          </span>
        )}
      </div>

      {/* Links */}
      <div className="flex gap-4 text-sm">
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-[var(--ds-status-success-text)] hover:opacity-80 inline-flex items-center gap-1">
          <ExternalLink size={14} /> Google Cloud Console
        </a>
        <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer" className="text-[var(--ds-status-success-text)] hover:opacity-80 inline-flex items-center gap-1">
          <ExternalLink size={14} /> Ativar Calendar API
        </a>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-[var(--ds-text-secondary)] mb-1.5">Client ID</label>
          <input
            type="text"
            value={calendarClientIdDraft}
            onChange={(e) => setCalendarClientIdDraft(e.target.value)}
            placeholder="xxxxx.apps.googleusercontent.com"
            className="w-full h-10 px-3 rounded-lg bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] text-[var(--ds-text-primary)] text-sm focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
          />
          {!calendarClientIdValid && calendarClientIdDraft && (
            <p className="mt-1 text-xs text-[var(--ds-status-warning-text)]">Deve terminar com .apps.googleusercontent.com</p>
          )}
        </div>

        <div>
          <label className="block text-sm text-[var(--ds-text-secondary)] mb-1.5">Client Secret</label>
          <input
            type="password"
            value={calendarClientSecretDraft}
            onChange={(e) => setCalendarClientSecretDraft(e.target.value)}
            placeholder="GOCSPX-..."
            className="w-full h-10 px-3 rounded-lg bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] text-[var(--ds-text-primary)] text-sm focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-[var(--ds-text-secondary)]">Redirect URI</label>
            <button type="button" onClick={() => handleCopyCalendarValue(calendarRedirectUrl, 'Redirect URI')} className="text-xs text-[var(--ds-status-success-text)] hover:opacity-80">
              Copiar
            </button>
          </div>
          <div className="h-10 px-3 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] flex items-center text-sm text-[var(--ds-status-success-text)] font-mono overflow-x-auto">
            {calendarRedirectUrl}
          </div>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Cole em "URIs de redirecionamento autorizados" no Google Cloud.</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        {calendarCredsStatus?.source === 'db' && calendarCredsStatus?.isConfigured ? (
          <button type="button" onClick={handleRemoveCalendarCreds} className="text-sm text-[var(--ds-status-error-text)] hover:opacity-80">
            Remover
          </button>
        ) : <div />}
        <button
          type="button"
          onClick={handleSaveCalendarCreds}
          disabled={!calendarCredsFormValid || calendarCredsSaving}
          className="h-10 px-5 rounded-lg bg-primary-600 text-white hover:bg-primary-500 dark:bg-white dark:text-black dark:hover:bg-neutral-100 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {calendarCredsSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
