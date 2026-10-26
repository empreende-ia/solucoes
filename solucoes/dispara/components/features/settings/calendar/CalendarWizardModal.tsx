'use client';

import React from 'react';
import { X, Check } from 'lucide-react';
import type { CalendarWizardModalProps } from './types';
import { WizardStepChecklist } from './WizardStepChecklist';
import { WizardStepCredentials } from './WizardStepCredentials';
import { WizardStepConnect } from './WizardStepConnect';
import { WizardStepCalendarSelection } from './WizardStepCalendarSelection';

export function CalendarWizardModal({
  isCalendarWizardOpen,
  setIsCalendarWizardOpen,
  calendarWizardStep,
  calendarWizardError,
  calendarWizardCanContinue,
  calendarTestLoading,
  calendarCredsError,
  calendarAuthError,
  calendarListError,
  calendarCredsStatus,
  calendarAuthStatus,
  handleCalendarWizardStepClick,
  handleCalendarWizardBack,
  handleCalendarWizardNext,
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
  calendarConnectLoading,
  handleConnectCalendar,
  handleDisconnectCalendar,
  fetchCalendarAuthStatus,
  calendarList,
  calendarListLoading,
  calendarSelectionId,
  calendarSelectionSaving,
  calendarListQuery,
  filteredCalendarList,
  selectedCalendarTimeZone,
  setCalendarSelectionId,
  setCalendarListQuery,
  fetchCalendarList,
  handleSaveCalendarSelection,
}: CalendarWizardModalProps) {
  if (!isCalendarWizardOpen) return null;

  const currentError = calendarWizardError
    || (calendarWizardStep === 1 && calendarCredsError)
    || (calendarWizardStep === 2 && calendarAuthError)
    || (calendarWizardStep === 3 && calendarListError);

  const steps = [
    { id: 0, label: 'Inicio', done: true },
    { id: 1, label: 'Credenciais', done: !!calendarCredsStatus?.isConfigured },
    { id: 2, label: 'Conectar', done: !!calendarAuthStatus?.connected },
    { id: 3, label: 'Calendario', done: !!calendarAuthStatus?.calendar?.calendarId },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[var(--ds-bg-base)] overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-[var(--ds-text-primary)]">Conectar Google Calendar</h1>
            <p className="text-sm text-[var(--ds-text-muted)]">Passo {calendarWizardStep + 1} de 4</p>
          </div>
          <button
            type="button"
            onClick={() => setIsCalendarWizardOpen(false)}
            className="p-2 rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex gap-2">
            {steps.map((step) => {
              const isActive = calendarWizardStep === step.id;
              const isClickable = step.id === 0 || step.id === 1
                || (step.id === 2 && calendarCredsStatus?.isConfigured)
                || (step.id === 3 && calendarAuthStatus?.connected);

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => isClickable && handleCalendarWizardStepClick(step.id)}
                  disabled={!isClickable}
                  className={`flex-1 h-2 rounded-full transition-colors ${
                    isActive
                      ? 'bg-[var(--ds-status-success)]'
                      : step.done
                        ? 'bg-[var(--ds-status-success)]/50'
                        : 'bg-[var(--ds-bg-surface)]'
                  } ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                  title={step.label}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((step) => {
              const isActive = calendarWizardStep === step.id;
              return (
                <span
                  key={step.id}
                  className={`text-xs ${isActive ? 'text-[var(--ds-status-success-text)] font-medium' : 'text-[var(--ds-text-muted)]'}`}
                >
                  {step.done && !isActive && <Check size={12} className="inline mr-1" />}
                  {step.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {currentError && (
          <div className="mb-6 rounded-lg border border-[var(--ds-status-error)]/30 bg-[var(--ds-status-error-bg)] px-4 py-3 text-sm text-[var(--ds-status-error-text)]">
            {currentError}
          </div>
        )}

        {/* Content */}
        {calendarWizardStep === 0 && <WizardStepChecklist />}

        {calendarWizardStep === 1 && (
          <WizardStepCredentials
            calendarCredsStatus={calendarCredsStatus}
            calendarAuthStatus={calendarAuthStatus}
            calendarCredsLoading={calendarCredsLoading}
            calendarCredsSaving={calendarCredsSaving}
            calendarClientIdDraft={calendarClientIdDraft}
            calendarClientSecretDraft={calendarClientSecretDraft}
            calendarBaseUrl={calendarBaseUrl}
            calendarBaseUrlDraft={calendarBaseUrlDraft}
            calendarBaseUrlEditing={calendarBaseUrlEditing}
            calendarRedirectUrl={calendarRedirectUrl}
            calendarClientIdValid={calendarClientIdValid}
            calendarClientSecretValid={calendarClientSecretValid}
            calendarCredsFormValid={calendarCredsFormValid}
            calendarCredsSourceLabel={calendarCredsSourceLabel}
            setCalendarClientIdDraft={setCalendarClientIdDraft}
            setCalendarClientSecretDraft={setCalendarClientSecretDraft}
            setCalendarBaseUrlDraft={setCalendarBaseUrlDraft}
            setCalendarBaseUrlEditing={setCalendarBaseUrlEditing}
            handleSaveCalendarCreds={handleSaveCalendarCreds}
            handleRemoveCalendarCreds={handleRemoveCalendarCreds}
            handleCopyCalendarValue={handleCopyCalendarValue}
          />
        )}

        {calendarWizardStep === 2 && (
          <WizardStepConnect
            calendarCredsStatus={calendarCredsStatus}
            calendarAuthStatus={calendarAuthStatus}
            calendarConnectLoading={calendarConnectLoading}
            handleConnectCalendar={handleConnectCalendar}
            handleDisconnectCalendar={handleDisconnectCalendar}
            fetchCalendarAuthStatus={fetchCalendarAuthStatus}
          />
        )}

        {calendarWizardStep === 3 && (
          <WizardStepCalendarSelection
            calendarCredsStatus={calendarCredsStatus}
            calendarAuthStatus={calendarAuthStatus}
            calendarList={calendarList}
            calendarListLoading={calendarListLoading}
            calendarListError={calendarListError}
            calendarSelectionId={calendarSelectionId}
            calendarSelectionSaving={calendarSelectionSaving}
            calendarListQuery={calendarListQuery}
            filteredCalendarList={filteredCalendarList}
            selectedCalendarTimeZone={selectedCalendarTimeZone}
            setCalendarSelectionId={setCalendarSelectionId}
            setCalendarListQuery={setCalendarListQuery}
            fetchCalendarList={fetchCalendarList}
            handleSaveCalendarSelection={handleSaveCalendarSelection}
          />
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-[var(--ds-border-default)]">
          <button
            type="button"
            onClick={handleCalendarWizardBack}
            className="h-10 px-5 rounded-lg border border-[var(--ds-border-default)] text-sm text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
          >
            {calendarWizardStep === 0 ? 'Fechar' : 'Voltar'}
          </button>
          <button
            type="button"
            onClick={handleCalendarWizardNext}
            disabled={!calendarWizardCanContinue || calendarTestLoading}
            className="h-10 px-6 rounded-lg bg-primary-600 text-white hover:bg-primary-500 dark:bg-white dark:text-black dark:hover:bg-neutral-100 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {calendarWizardStep === 3
              ? (calendarTestLoading ? 'Testando...' : 'Concluir')
              : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
