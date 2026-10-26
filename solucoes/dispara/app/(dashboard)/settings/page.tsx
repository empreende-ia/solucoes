'use client'

import { useState } from 'react'
import { useSettingsController } from '@/hooks/useSettings'
import { SettingsView } from '@/components/features/settings/SettingsView'
import { SetupWizardView } from '@/components/features/settings/SetupWizardView'
import { UsagePanel } from '@/components/UsagePanel'
import { useUsage } from '@/hooks/useUsage'
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'

export default function SettingsPage() {
  const controller = useSettingsController()
  const { usage, isLoading: usageLoading, refetch: refetchUsage } = useUsage()
  const [skipWizard, setSkipWizard] = useState(false)

  // Show Setup Wizard apenas se algum passo obrigatório não estiver pronto
  // WhatsApp pode ser configurado depois em Configurações
  const showWizard = controller.needsSetup && !skipWizard

  if (showWizard) {
    return (
      <SetupWizardView
        steps={controller.setupSteps}
        isLoading={controller.systemHealthLoading}
        onRefresh={controller.refreshSystemHealth}
        onContinueToSettings={
          controller.infrastructureReady
            ? () => setSkipWizard(true)
            : undefined
        }
        allConfigured={controller.allConfigured}
      />
    )
  }

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Configurações</PageTitle>
          <PageDescription>Gerencie sua conexão com a WhatsApp Business API</PageDescription>
        </div>
      </PageHeader>

      {/* Grid responsivo: mobile=1col, xl=3col */}
      <div className="flex flex-col xl:flex-row gap-8">
        {/* Settings Main Content */}
        <div className="flex-1 min-w-0 xl:max-w-3xl">
          <SettingsView
            settings={controller.settings}
            setSettings={controller.setSettings}
            isLoading={controller.isLoading}
            isSaving={controller.isSaving}
            onSave={controller.onSave}
            onSaveSettings={controller.onSaveSettings}
            onDisconnect={controller.onDisconnect}
            onTestConnection={controller.onTestConnection}
            isTestingConnection={controller.isTestingConnection}
            accountLimits={controller.accountLimits}
            tierName={controller.tierName}
            limitsError={controller.limitsError}
            limitsErrorMessage={controller.limitsErrorMessage}
            limitsLoading={controller.limitsLoading}
            onRefreshLimits={controller.refreshLimits}
            webhookUrl={controller.webhookUrl}
            webhookToken={controller.webhookToken}
            webhookStats={controller.webhookStats}
            webhookSubscription={controller.webhookSubscription}
            webhookSubscriptionLoading={controller.webhookSubscriptionLoading}
            onRefreshWebhookSubscription={controller.refreshWebhookSubscription}
            onSubscribeWebhookMessages={controller.subscribeWebhookMessages}
            onUnsubscribeWebhookMessages={controller.unsubscribeWebhookMessages}
            webhookSubscriptionMutating={controller.webhookSubscriptionMutating}
            phoneNumbers={controller.phoneNumbers}
            phoneNumbersLoading={controller.phoneNumbersLoading}
            onRefreshPhoneNumbers={controller.refreshPhoneNumbers}
            onSetWebhookOverride={controller.setWebhookOverride}
            onRemoveWebhookOverride={controller.removeWebhookOverride}
            availableDomains={controller.availableDomains}

            webhookPath={controller.webhookPath}

            // Meta App (opcional)
            metaApp={controller.metaApp}
            metaAppLoading={controller.metaAppLoading}
            refreshMetaApp={controller.refreshMetaApp}
            // Test Contact - Supabase
            testContact={controller.testContact}
            saveTestContact={controller.saveTestContact}
            removeTestContact={controller.removeTestContact}
            isSavingTestContact={controller.isSavingTestContact}

            // WhatsApp Turbo
            whatsappThrottle={controller.whatsappThrottle}
            whatsappThrottleLoading={controller.whatsappThrottleLoading}
            saveWhatsAppThrottle={controller.saveWhatsAppThrottle}
            isSavingWhatsAppThrottle={controller.isSavingWhatsAppThrottle}

            // Auto-supressão (Proteção de Qualidade)
            autoSuppression={controller.autoSuppression}
            autoSuppressionLoading={controller.autoSuppressionLoading}
            saveAutoSuppression={controller.saveAutoSuppression}
            isSavingAutoSuppression={controller.isSavingAutoSuppression}

            // Agendamento (Google Calendar)
            calendarBooking={controller.calendarBooking}
            calendarBookingLoading={controller.calendarBookingLoading}
            saveCalendarBooking={controller.saveCalendarBooking}
            isSavingCalendarBooking={controller.isSavingCalendarBooking}

            // Execução do workflow (global)
            workflowExecution={controller.workflowExecution}
            workflowExecutionLoading={controller.workflowExecutionLoading}
            saveWorkflowExecution={controller.saveWorkflowExecution}
            isSavingWorkflowExecution={controller.isSavingWorkflowExecution}
            hideHeader
          />
        </div>

        {/* Usage Panel - sidebar alinhado ao topo */}
        <div className="w-full xl:w-80 shrink-0">
          <UsagePanel
            usage={usage}
            isLoading={usageLoading}
            onRefresh={refetchUsage}
          />
        </div>
      </div>
    </Page>
  )
}
