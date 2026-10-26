import { PhoneNumber } from '../../../../hooks/useSettings';

export interface WebhookStats {
  lastEventAt?: string | null;
  todayDelivered?: number;
  todayRead?: number;
  todayFailed?: number;
}

export interface DomainOption {
  url: string;
  source: string;
  recommended: boolean;
}

export interface WabaOverrideStatus {
  url: string | null;
  isConfigured: boolean;
  isDispara: boolean;
}

export interface WebhookHierarchy {
  phoneNumberOverride: string | null;
  wabaOverride: string | null;
  appWebhook: string | null;
}

export interface WebhookSubscription {
  ok: boolean;
  wabaId?: string;
  messagesSubscribed?: boolean;
  subscribedFields?: string[];
  error?: string;
  // Novo: informações do override WABA (#2)
  wabaOverride?: WabaOverrideStatus;
  hierarchy?: WebhookHierarchy | null;
  disparaWebhookUrl?: string;
}

export interface WebhookStatus {
  status: 'dispara' | 'other' | 'waba' | 'app' | 'none';
  url: string | null;
  level: number;
  levelName: string;
  levelDescription: string;
}

export interface WebhookFunnelLevel {
  level: number;
  name: string;
  url: string | null;
  isActive: boolean;
  isDispara: boolean;
  color: 'purple' | 'blue' | 'slate';
  description: string;
  isLocked?: boolean;
}

export interface WebhookConfigSectionProps {
  webhookUrl?: string;
  webhookToken?: string;
  webhookStats?: WebhookStats | null;
  webhookPath?: string;
  webhookSubscription?: WebhookSubscription | null;
  webhookSubscriptionLoading?: boolean;
  webhookSubscriptionMutating?: boolean;
  onRefreshWebhookSubscription?: () => void;
  onSubscribeWebhookMessages?: (callbackUrl?: string) => Promise<void>;
  onUnsubscribeWebhookMessages?: () => Promise<void>;
  phoneNumbers?: PhoneNumber[];
  phoneNumbersLoading?: boolean;
  onRefreshPhoneNumbers?: () => void;
  onSetWebhookOverride?: (phoneNumberId: string, callbackUrl: string) => Promise<boolean>;
  onRemoveWebhookOverride?: (phoneNumberId: string) => Promise<boolean>;
  availableDomains?: DomainOption[];
}

export type CardColor = 'purple' | 'amber' | 'blue' | 'slate';
