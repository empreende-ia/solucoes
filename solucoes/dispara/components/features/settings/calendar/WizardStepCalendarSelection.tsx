'use client';

import React from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type { WizardStepCalendarSelectionProps } from './types';

export function WizardStepCalendarSelection({
  calendarAuthStatus,
  calendarList,
  calendarListLoading,
  calendarListError,
  calendarSelectionId,
  calendarSelectionSaving,
  calendarListQuery,
  filteredCalendarList,
  selectedCalendarTimeZone,
  setCalendarSelectionId,
  setCalendarListQuery,
  fetchCalendarList,
  handleSaveCalendarSelection,
}: WizardStepCalendarSelectionProps) {
  const hasCalendar = !!calendarAuthStatus?.calendar?.calendarId;

  if (!calendarAuthStatus?.connected) {
    return (
      <div className="p-4 rounded-lg bg-[var(--ds-status-warning-bg)] border border-[var(--ds-status-warning)]/30 text-[var(--ds-status-warning-text)] text-sm">
        Conecte o Google Calendar primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--ds-text-primary)]">Escolher calendario</h2>
          <p className="mt-1 text-[var(--ds-text-secondary)]">Selecione qual calendario usar.</p>
        </div>
        {hasCalendar && (
          <span className="flex items-center gap-1 text-sm text-[var(--ds-status-success-text)]">
            <Check size={16} /> {calendarAuthStatus?.calendar?.calendarSummary}
          </span>
        )}
      </div>

      {calendarListLoading ? (
        <div className="flex items-center gap-2 text-[var(--ds-text-secondary)]">
          <RefreshCw className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : calendarListError ? (
        <div className="p-4 rounded-lg bg-[var(--ds-status-error-bg)] border border-[var(--ds-status-error)]/30 text-[var(--ds-status-error-text)] text-sm">
          {calendarListError}
        </div>
      ) : calendarList.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-[var(--ds-text-secondary)] mb-3">Nenhum calendario encontrado.</p>
          <button type="button" onClick={fetchCalendarList} className="text-sm text-[var(--ds-status-success-text)] hover:opacity-80">
            Atualizar lista
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--ds-text-secondary)] mb-1.5">Buscar</label>
            <input
              type="text"
              value={calendarListQuery}
              onChange={(e) => setCalendarListQuery(e.target.value)}
              placeholder="Filtrar calendarios..."
              className="w-full h-10 px-3 rounded-lg bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] text-[var(--ds-text-primary)] text-sm focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--ds-text-secondary)] mb-1.5">Calendario</label>
            <select
              value={calendarSelectionId}
              onChange={(e) => setCalendarSelectionId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] text-[var(--ds-text-primary)] text-sm focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
            >
              <option value="">Selecione...</option>
              {filteredCalendarList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.summary || item.id}{item.primary ? ' (principal)' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedCalendarTimeZone && (
            <p className="text-sm text-[var(--ds-text-muted)]">
              Fuso: <code className="text-[var(--ds-status-success-text)]">{selectedCalendarTimeZone}</code>
            </p>
          )}

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={fetchCalendarList} className="text-sm text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]">
              Atualizar lista
            </button>
            <button
              type="button"
              onClick={handleSaveCalendarSelection}
              disabled={!calendarSelectionId || calendarSelectionSaving}
              className="h-10 px-5 rounded-lg bg-primary-600 text-white hover:bg-primary-500 dark:bg-white dark:text-black dark:hover:bg-neutral-100 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {calendarSelectionSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
