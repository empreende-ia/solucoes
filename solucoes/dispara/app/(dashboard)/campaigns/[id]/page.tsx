'use client'

import { useCampaignDetailsController } from '@/hooks/useCampaignDetails'
import { CampaignDetailsView } from '@/components/features/campaigns/CampaignDetailsView'

export default function CampaignDetailsPage() {
  const controller = useCampaignDetailsController()

  return (
    <CampaignDetailsView
      campaign={controller.campaign}
      messages={controller.messages}
      messageStats={controller.messageStats}
      realStats={controller.realStats}
      metrics={controller.metrics}
      isLoading={controller.isLoading}
      searchTerm={controller.searchTerm}
      setSearchTerm={controller.setSearchTerm}
      navigate={controller.navigate}
      onPause={controller.onPause}
      onResume={controller.onResume}
      onStart={controller.onStart}
      onCancelSchedule={controller.onCancelSchedule}
      onCancelSend={controller.onCancelSend}
      onResendSkipped={controller.onResendSkipped}
      isResendingSkipped={controller.isResendingSkipped}
      isPausing={controller.isPausing}
      isResuming={controller.isResuming}
      isStarting={controller.isStarting}
      isCancelingSchedule={controller.isCancelingSchedule}
      isCancelingSend={controller.isCancelingSend}
      canPause={controller.canPause}
      canResume={controller.canResume}
      canStart={controller.canStart}
      canCancelSchedule={controller.canCancelSchedule}
      canCancelSend={controller.canCancelSend}
      isRealtimeConnected={controller.isRealtimeConnected}
      shouldShowRefreshButton={controller.shouldShowRefreshButton}
      telemetry={controller.telemetry}
      isRefreshing={controller.isRefreshing}
      refetch={controller.refetch}
      filterStatus={controller.filterStatus}
      setFilterStatus={controller.setFilterStatus}
      onLoadMore={controller.onLoadMore}
      canLoadMore={controller.canLoadMore}
      isLoadingMore={controller.isLoadingMore}
      includeReadInDelivered={controller.includeReadInDelivered}
      setIncludeReadInDelivered={controller.setIncludeReadInDelivered}
    />
  )
}
