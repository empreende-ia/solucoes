'use client';

import React, { useState } from 'react';
import { Calendar, Edit2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import {
  useCalendarBooking,
  type UseCalendarBookingProps,
  CALENDAR_WEEK_LABELS,
} from '../../../hooks/settings/useCalendarBooking';
import {
  BookingConfigSection,
  BookingFlowSection,
  CalendarStatusSection,
  CalendarWizardModal,
} from './calendar';
import { Container } from '@/components/ui/container';
import { StatusBadge } from '@/components/ui/status-badge';

export interface CalendarBookingPanelProps extends UseCalendarBookingProps {
  // Additional props can be added here if needed
}

export function CalendarBookingPanel({
  isConnected,
  calendarBooking,
  calendarBookingLoading,
  saveCalendarBooking,
  isSavingCalendarBooking,
}: CalendarBookingPanelProps) {
  const hook = useCalendarBooking({
    isConnected,
    calendarBooking,
    calendarBookingLoading,
    saveCalendarBooking,
    isSavingCalendarBooking,
  });

  // Colapsado por padrão quando conectado
  const [isExpanded, setIsExpanded] = useState(false);
  const isConfigured = hook.calendarAuthStatus?.connected && hook.calendarAuthStatus?.calendar?.calendarId;

  // Resumo dos dias habilitados
  const enabledDays = hook.calendarDraft.workingHours.filter(d => d.enabled);
  const enabledDayLabels = enabledDays.map(d => CALENDAR_WEEK_LABELS[d.day]?.slice(0, 3)).join(', ');

  return (
    <Container variant="glass" padding="md">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ds-status-success-bg)] flex items-center justify-center">
            <Calendar size={20} className="text-[var(--ds-status-success-text)]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--ds-text-primary)]">Agendamento (Google Calendar)</h3>
            <p className="text-sm text-[var(--ds-text-muted)]">
              {isConfigured ? 'Conectado e configurado' : 'Configure para habilitar agendamentos'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConfigured && (
            <StatusBadge status="success" showDot>Ativo</StatusBadge>
          )}
          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              hook.setIsEditingCalendarBooking(true);
            }}
            className="h-9 px-4 rounded-lg bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] text-sm font-medium inline-flex items-center gap-2"
          >
            <Edit2 size={14} /> Editar
          </button>
        </div>
      </div>

      {/* Resumo compacto quando colapsado */}
      {!isExpanded && (
        <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)]">
          {isConfigured ? (
            // Conectado: mostra resumo da config
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-[var(--ds-text-muted)]">Calendario:</span>{' '}
                <span className="text-[var(--ds-text-primary)]">{hook.calendarAuthStatus?.calendar?.calendarSummary}</span>
              </div>
              <div>
                <span className="text-[var(--ds-text-muted)]">Slots:</span>{' '}
                <span className="text-[var(--ds-text-primary)]">{hook.calendarDraft.slotDurationMinutes}min</span>
              </div>
              <div>
                <span className="text-[var(--ds-text-muted)]">Dias:</span>{' '}
                <span className="text-[var(--ds-text-primary)]">{enabledDayLabels || 'Nenhum'}</span>
              </div>
            </div>
          ) : (
            // Desconectado: mostra status e CTA
            <div className="flex items-center gap-3 text-sm">
              <StatusBadge status="warning" showDot>Desconectado</StatusBadge>
              <span className="text-[var(--ds-text-muted)]">Conecte o Google Calendar para habilitar agendamentos</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-sm text-[var(--ds-status-success-text)] hover:opacity-80 flex items-center gap-1"
          >
            {isConfigured ? 'Expandir' : 'Configurar'} <ChevronDown size={16} />
          </button>
        </div>
      )}

      {/* Conteúdo expandido */}
      {isExpanded && (
        <>
          {/* Calendar Status Section */}
          <CalendarStatusSection
            calendarAuthLoading={hook.calendarAuthLoading}
            calendarAuthStatus={hook.calendarAuthStatus}
            calendarTestLoading={hook.calendarTestLoading}
            calendarTestResult={hook.calendarTestResult}
            handlePrimaryCalendarAction={hook.handlePrimaryCalendarAction}
            handleCalendarTestEvent={hook.handleCalendarTestEvent}
            setCalendarWizardStep={hook.setCalendarWizardStep}
            setCalendarWizardError={hook.setCalendarWizardError}
            setIsCalendarWizardOpen={hook.setIsCalendarWizardOpen}
          />

          {/* Booking Configuration Section */}
          <BookingConfigSection
            calendarBookingLoading={calendarBookingLoading}
            calendarBooking={calendarBooking}
            isEditingCalendarBooking={hook.isEditingCalendarBooking}
            setIsEditingCalendarBooking={hook.setIsEditingCalendarBooking}
            calendarDraft={hook.calendarDraft}
            updateCalendarDraft={hook.updateCalendarDraft}
            updateWorkingHours={hook.updateWorkingHours}
            handleSaveCalendarBooking={hook.handleSaveCalendarBooking}
            isSavingCalendarBooking={isSavingCalendarBooking}
          />

          {/* Booking Flow Selection */}
          <BookingFlowSection />

          {/* Botão de colapsar */}
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-sm text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] flex items-center gap-1"
            >
              <ChevronUp size={16} /> Recolher
            </button>
          </div>
        </>
      )}

      {/* Calendar Wizard Modal */}
      <CalendarWizardModal
        isCalendarWizardOpen={hook.isCalendarWizardOpen}
        setIsCalendarWizardOpen={hook.setIsCalendarWizardOpen}
        calendarWizardStep={hook.calendarWizardStep}
        calendarWizardError={hook.calendarWizardError}
        calendarWizardCanContinue={hook.calendarWizardCanContinue}
        calendarTestLoading={hook.calendarTestLoading}
        calendarCredsError={hook.calendarCredsError}
        calendarAuthError={hook.calendarAuthError}
        calendarListError={hook.calendarListError}
        calendarCredsStatus={hook.calendarCredsStatus}
        calendarAuthStatus={hook.calendarAuthStatus}
        handleCalendarWizardStepClick={hook.handleCalendarWizardStepClick}
        handleCalendarWizardBack={hook.handleCalendarWizardBack}
        handleCalendarWizardNext={hook.handleCalendarWizardNext}
        calendarCredsLoading={hook.calendarCredsLoading}
        calendarCredsSaving={hook.calendarCredsSaving}
        calendarClientIdDraft={hook.calendarClientIdDraft}
        calendarClientSecretDraft={hook.calendarClientSecretDraft}
        calendarBaseUrl={hook.calendarBaseUrl}
        calendarBaseUrlDraft={hook.calendarBaseUrlDraft}
        calendarBaseUrlEditing={hook.calendarBaseUrlEditing}
        calendarRedirectUrl={hook.calendarRedirectUrl}
        calendarClientIdValid={hook.calendarClientIdValid}
        calendarClientSecretValid={hook.calendarClientSecretValid}
        calendarCredsFormValid={hook.calendarCredsFormValid}
        calendarCredsSourceLabel={hook.calendarCredsSourceLabel}
        setCalendarClientIdDraft={hook.setCalendarClientIdDraft}
        setCalendarClientSecretDraft={hook.setCalendarClientSecretDraft}
        setCalendarBaseUrlDraft={hook.setCalendarBaseUrlDraft}
        setCalendarBaseUrlEditing={hook.setCalendarBaseUrlEditing}
        handleSaveCalendarCreds={hook.handleSaveCalendarCreds}
        handleRemoveCalendarCreds={hook.handleRemoveCalendarCreds}
        handleCopyCalendarValue={hook.handleCopyCalendarValue}
        calendarConnectLoading={hook.calendarConnectLoading}
        handleConnectCalendar={hook.handleConnectCalendar}
        handleDisconnectCalendar={hook.handleDisconnectCalendar}
        fetchCalendarAuthStatus={hook.fetchCalendarAuthStatus}
        calendarList={hook.calendarList}
        calendarListLoading={hook.calendarListLoading}
        calendarSelectionId={hook.calendarSelectionId}
        calendarSelectionSaving={hook.calendarSelectionSaving}
        calendarListQuery={hook.calendarListQuery}
        filteredCalendarList={hook.filteredCalendarList}
        selectedCalendarTimeZone={hook.selectedCalendarTimeZone}
        setCalendarSelectionId={hook.setCalendarSelectionId}
        setCalendarListQuery={hook.setCalendarListQuery}
        fetchCalendarList={hook.fetchCalendarList}
        handleSaveCalendarSelection={hook.handleSaveCalendarSelection}
      />
    </Container>
  );
}
