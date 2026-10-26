import React, { useEffect, useRef, useState } from 'react';
import { TestContactPanel } from './TestContactPanel';
import { AutoSuppressionPanel } from './AutoSuppressionPanel';
import { WorkflowExecutionPanel } from './WorkflowExecutionPanel';
import { StatusCard } from './StatusCard';
import { TurboConfigSection } from './TurboConfigSection';
import { WebhookConfigSection } from './WebhookConfigSection';
import { CalendarBookingPanel } from './CalendarBookingPanel';
import { FlowEndpointPanel } from './FlowEndpointPanel';
import { CredentialsForm } from './CredentialsForm';
import { ApiDocsPanel } from './ApiDocsPanel';
import { BrandPanel } from './BrandPanel';
import { useDevMode } from '@/components/providers/DevModeProvider';
import { MessageSquare, FileText, Palette } from 'lucide-react';
import type { SettingsViewProps } from './types';

// Re-export types for consumers
export type { SettingsViewProps } from './types';

type SettingsTab = 'whatsapp' | 'brand' | 'api';

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  setSettings,
  isLoading,
  isSaving,
  onSave,
  onDisconnect,
  accountLimits,
  limitsError,
  limitsErrorMessage,
  limitsLoading,
  onRefreshLimits,
  webhookUrl,
  webhookToken,
  webhookStats,
  webhookSubscription,
  webhookSubscriptionLoading,
  webhookSubscriptionMutating,
  onRefreshWebhookSubscription,
  onSubscribeWebhookMessages,
  onUnsubscribeWebhookMessages,
  phoneNumbers,
  phoneNumbersLoading,
  onRefreshPhoneNumbers,
  onSetWebhookOverride,
  onRemoveWebhookOverride,
  availableDomains,
  webhookPath,
  hideHeader,

  onTestConnection,
  isTestingConnection,

  // Meta App
  metaApp,
  metaAppLoading,
  refreshMetaApp,
  // Test Contact Props - Supabase
  testContact,
  saveTestContact,
  removeTestContact,
  isSavingTestContact,

  // Turbo
  whatsappThrottle,
  whatsappThrottleLoading,
  saveWhatsAppThrottle,
  isSavingWhatsAppThrottle,

  // Auto-supressão
  autoSuppression,
  autoSuppressionLoading,
  saveAutoSuppression,
  isSavingAutoSuppression,

  // Calendar Booking
  calendarBooking,
  calendarBookingLoading,
  saveCalendarBooking,
  isSavingCalendarBooking,

  // Workflow Execution (global)
  workflowExecution,
  workflowExecutionLoading,
  saveWorkflowExecution,
  isSavingWorkflowExecution,

}) => {
  const { isDevMode } = useDevMode();
  const [activeTab, setActiveTab] = useState<SettingsTab>('whatsapp');
  const [isEditing, setIsEditing] = useState(false);

  const statusCardRef = useRef<HTMLDivElement | null>(null);
  const credentialsFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEditing) return;
    const t = window.setTimeout(() => {
      credentialsFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(t);
  }, [isEditing]);

  if (isLoading) return <div className="text-[var(--ds-text-primary)]">Carregando configurações...</div>;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'whatsapp', label: 'WhatsApp', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'brand', label: 'Marca', icon: <Palette className="w-4 h-4" /> },
    { id: 'api', label: 'Documentação API', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div>
      {!hideHeader && (
        <>
          <h1 className="text-3xl font-bold text-[var(--ds-text-primary)] tracking-tight mb-2">Configurações</h1>
          <p className="text-[var(--ds-text-secondary)] mb-6">Gerencie suas integrações e configurações do sistema</p>
        </>
      )}

      {/* Status Card — sempre visível */}
      <div className="mb-8">
        <StatusCard
          ref={statusCardRef}
          settings={settings}
          limitsLoading={limitsLoading}
          limitsError={limitsError}
          limitsErrorMessage={limitsErrorMessage}
          accountLimits={accountLimits}
          onRefreshLimits={onRefreshLimits}
          onDisconnect={onDisconnect}
          isEditing={isEditing}
          onToggleEdit={() => setIsEditing((v) => !v)}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-8 border-b border-[var(--ds-border-default)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all duration-200 border-b-2 -mb-[1px]
              ${activeTab === tab.id
                ? 'text-primary-400 border-primary-500'
                : 'text-[var(--ds-text-muted)] border-transparent hover:text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-default)]'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-8">

        {/* ═══════ ABA: WhatsApp ═══════ */}
        {activeTab === 'whatsapp' && (
          <>

            {/* Credentials Form */}
            {(!settings.isConnected || isEditing) && (
              <CredentialsForm
                ref={credentialsFormRef}
                settings={settings}
                setSettings={setSettings}
                onSave={onSave}
                onClose={() => setIsEditing(false)}
                isSaving={isSaving}
                onTestConnection={onTestConnection}
                isTestingConnection={isTestingConnection}
                metaApp={metaApp}
                refreshMetaApp={refreshMetaApp}
              />
            )}

            {/* Webhook Configuration */}
            {settings.isConnected && webhookUrl && (
              <section id="webhooks">
                <WebhookConfigSection
                  webhookUrl={webhookUrl}
                  webhookToken={webhookToken}
                  webhookStats={webhookStats}
                  webhookPath={webhookPath}
                  webhookSubscription={webhookSubscription}
                  webhookSubscriptionLoading={webhookSubscriptionLoading}
                  webhookSubscriptionMutating={webhookSubscriptionMutating}
                  onRefreshWebhookSubscription={onRefreshWebhookSubscription}
                  onSubscribeWebhookMessages={onSubscribeWebhookMessages}
                  onUnsubscribeWebhookMessages={onUnsubscribeWebhookMessages}
                  phoneNumbers={phoneNumbers}
                  phoneNumbersLoading={phoneNumbersLoading}
                  onRefreshPhoneNumbers={onRefreshPhoneNumbers}
                  onSetWebhookOverride={onSetWebhookOverride}
                  onRemoveWebhookOverride={onRemoveWebhookOverride}
                  availableDomains={availableDomains}
                />
              </section>
            )}

            {/* Test Contact */}
            {settings.isConnected && (
              <TestContactPanel
                testContact={testContact}
                saveTestContact={saveTestContact}
                removeTestContact={removeTestContact}
                isSaving={isSavingTestContact}
              />
            )}

            {/* Calendar Booking */}
            {settings.isConnected && (
              <CalendarBookingPanel
                isConnected={settings.isConnected}
                calendarBooking={calendarBooking}
                calendarBookingLoading={calendarBookingLoading}
                saveCalendarBooking={saveCalendarBooking}
                isSavingCalendarBooking={isSavingCalendarBooking}
              />
            )}

            {/* Dev-only sections */}
            {isDevMode && settings.isConnected && <FlowEndpointPanel devBaseUrl={null} />}

            {isDevMode && settings.isConnected && saveWhatsAppThrottle && (
              <TurboConfigSection
                whatsappThrottle={whatsappThrottle}
                whatsappThrottleLoading={whatsappThrottleLoading}
                saveWhatsAppThrottle={saveWhatsAppThrottle}
                isSaving={isSavingWhatsAppThrottle}
                settings={settings}
              />
            )}

            {isDevMode && settings.isConnected && saveAutoSuppression && (
              <AutoSuppressionPanel
                autoSuppression={autoSuppression}
                autoSuppressionLoading={autoSuppressionLoading}
                saveAutoSuppression={saveAutoSuppression}
                isSaving={isSavingAutoSuppression}
              />
            )}

            {isDevMode && settings.isConnected && saveWorkflowExecution && (
              <WorkflowExecutionPanel
                workflowExecution={workflowExecution}
                workflowExecutionLoading={workflowExecutionLoading}
                saveWorkflowExecution={saveWorkflowExecution}
                isSaving={isSavingWorkflowExecution}
              />
            )}
          </>
        )}

        {/* ═══════ ABA: Marca (whitelabel) ═══════ */}
        {activeTab === 'brand' && (
          <BrandPanel />
        )}

        {/* ═══════ ABA: Documentação API ═══════ */}
        {activeTab === 'api' && (
          <ApiDocsPanel />
        )}

      </div>
    </div>
  );
};
