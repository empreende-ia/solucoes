import { Campaign, CampaignStatus, Message, MessageStatus, RealtimeLatencyTelemetry } from '@/types';

// Navigate function type compatible with Next.js
export type NavigateFn = (path: string, options?: { replace?: boolean }) => void;

export interface DetailCardProps {
  title: string;
  value: string;
  subvalue: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  onClick?: () => void;
  isActive?: boolean;
}

export interface MessageStats {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  skipped: number;
  failed: number;
}

export interface RealStats {
  sent: number;
  failed: number;
  skipped: number;
  delivered: number;
  read: number;
  total: number;
}

export interface CampaignDetailsViewProps {
  campaign?: Campaign;
  messages: Message[];
  messageStats?: MessageStats | null;
  realStats?: RealStats | null;
  metrics?: any | null;
  isLoading: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  navigate: NavigateFn;
  // Actions
  onPause?: () => void;
  onResume?: () => void;
  onStart?: () => void;
  onCancelSchedule?: () => void;
  onCancelSend?: () => void;
  onResendSkipped?: () => void;
  isPausing?: boolean;
  isResuming?: boolean;
  isStarting?: boolean;
  isCancelingSchedule?: boolean;
  isCancelingSend?: boolean;
  isResendingSkipped?: boolean;
  canPause?: boolean;
  canResume?: boolean;
  canStart?: boolean;
  canCancelSchedule?: boolean;
  canCancelSend?: boolean;
  // Realtime status
  isRealtimeConnected?: boolean;
  shouldShowRefreshButton?: boolean;
  isRefreshing?: boolean;
  refetch?: () => void;
  filterStatus?: MessageStatus | null;
  setFilterStatus?: (status: MessageStatus | null) => void;
  telemetry?: RealtimeLatencyTelemetry | null;
  // Pagination (Load more)
  onLoadMore?: () => void;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  // Delivered filter mode
  includeReadInDelivered?: boolean;
  setIncludeReadInDelivered?: (value: boolean) => void;
}

export interface CampaignHeaderProps {
  campaign: Campaign;
  isRealtimeConnected?: boolean;
  scheduledTimeDisplay: string | null;
  campaignStatusClass: string;
  // Actions
  canStart?: boolean;
  onStart?: () => void;
  isStarting?: boolean;
  canCancelSchedule?: boolean;
  onCancelSchedule?: () => void;
  isCancelingSchedule?: boolean;
  canCancelSend?: boolean;
  onCancelSend?: () => void;
  isCancelingSend?: boolean;
  canPause?: boolean;
  onPause?: () => void;
  isPausing?: boolean;
  canResume?: boolean;
  onResume?: () => void;
  isResuming?: boolean;
  shouldShowRefreshButton?: boolean;
  refetch?: () => void;
  isRefreshing?: boolean;
  skippedCount: number;
  onResendSkipped?: () => void;
  isResendingSkipped?: boolean;
  onShowTemplatePreview: () => void;
}

export interface CampaignStatsGridProps {
  sentCount: number;
  deliveredTotal: number;
  readCount: number;
  skippedCount: number;
  failedCount: number;
  deliveredOnlyCount: number;
  recipients: number;
  hasLiveStats: boolean;
  filterStatus?: MessageStatus | null;
  setFilterStatus?: (status: MessageStatus | null) => void;
  setIncludeReadInDelivered?: (value: boolean) => void;
}

export interface CampaignPerformancePanelProps {
  isPerfOpen: boolean;
  setIsPerfOpen: (open: boolean) => void;
  perfSourceLabel: { label: string; tone: string };
  metrics: any;
  perf: any;
  throughputMpsForUi: number;
  dispatchDurationMsForUi: number;
  isPerfEstimatedLive: boolean;
  baselineThroughputMedian: number | null;
  limiterInfo: { value: string; subvalue: string; color: string };
}

export interface CampaignTelemetryPanelProps {
  telemetry: RealtimeLatencyTelemetry;
}

export interface MessageLogTableProps {
  messages: Message[];
  messageStats?: MessageStats | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterStatus?: MessageStatus | null;
  includeReadInDelivered?: boolean;
  setIncludeReadInDelivered?: (value: boolean) => void;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onQuickEditContact: (contactId: string, focus: any) => void;
}

export interface PreparingCampaignViewProps {
  campaign: Campaign;
  messages: Message[];
}

export interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateName: string;
}
