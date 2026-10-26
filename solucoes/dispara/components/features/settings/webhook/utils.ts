import { PhoneNumber } from '../../../../hooks/useSettings';
import { WebhookStatus, WebhookFunnelLevel } from './types';

/**
 * Determina o status do webhook para um número de telefone
 * com base na hierarquia de configuração da Meta
 */
export function getWebhookStatus(
  phone: PhoneNumber,
  activeUrl: string | undefined
): WebhookStatus {
  const config = phone.webhook_configuration;

  // Level 1: Phone number override
  if (config?.phone_number) {
    const isDispara = config.phone_number === activeUrl;
    return {
      status: isDispara ? 'dispara' : 'other',
      url: config.phone_number,
      level: 1,
      levelName: 'NÚMERO',
      levelDescription: 'Override específico deste número',
    };
  }

  // Level 2: WABA override
  if (config?.whatsapp_business_account) {
    return {
      status: 'waba',
      url: config.whatsapp_business_account,
      level: 2,
      levelName: 'WABA',
      levelDescription: 'Override da conta comercial',
    };
  }

  // Level 3: App callback
  if (config?.application) {
    return {
      status: 'app',
      url: config.application,
      level: 3,
      levelName: 'APP',
      levelDescription: 'Padrão do Meta Developer Dashboard',
    };
  }

  return {
    status: 'none',
    url: null,
    level: 0,
    levelName: 'NENHUM',
    levelDescription: 'Nenhum webhook configurado',
  };
}

/**
 * Retorna os 3 níveis do funil de webhook para visualização
 */
export function getWebhookFunnelLevels(
  phone: PhoneNumber,
  activeUrl: string | undefined
): WebhookFunnelLevel[] {
  const config = phone.webhook_configuration;
  const activeStatus = getWebhookStatus(phone, activeUrl);

  return [
    {
      level: 1,
      name: 'NÚMERO',
      url: config?.phone_number || null,
      isActive: activeStatus.level === 1,
      isDispara: config?.phone_number === activeUrl,
      color: 'purple',
      description: 'Override específico deste número',
    },
    {
      level: 2,
      name: 'WABA',
      url: config?.whatsapp_business_account || null,
      isActive: activeStatus.level === 2,
      isDispara: config?.whatsapp_business_account === activeUrl,
      color: 'blue',
      description: 'Override da conta comercial',
    },
    {
      level: 3,
      name: 'APP',
      url: config?.application || null,
      isActive: activeStatus.level === 3,
      isDispara: config?.application === activeUrl,
      color: 'slate',
      description: 'Padrão do Meta Dashboard',
      isLocked: true,
    },
  ];
}

/**
 * Determina a cor do card baseado no status do webhook
 */
export function getCardColor(
  webhookStatus: WebhookStatus
): 'purple' | 'amber' | 'blue' | 'slate' {
  if (webhookStatus.status === 'dispara') return 'purple';
  if (webhookStatus.status === 'other') return 'amber';
  if (webhookStatus.level === 2) return 'blue';
  return 'slate';
}

/**
 * Retorna classes CSS para cor do card
 */
export function getCardColorClasses(color: 'purple' | 'amber' | 'blue' | 'slate'): {
  border: string;
  bg: string;
  icon: string;
  text: string;
} {
  const colorMap = {
    purple: {
      border: 'border-primary-500/20',
      bg: 'bg-primary-500/5',
      icon: 'bg-primary-500/20 text-primary-400',
      text: 'text-primary-400/80',
    },
    amber: {
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
      icon: 'bg-amber-500/20 text-amber-400',
      text: 'text-amber-400/80',
    },
    blue: {
      border: 'border-blue-500/20',
      bg: 'bg-blue-500/5',
      icon: 'bg-blue-500/20 text-blue-400',
      text: 'text-blue-400/80',
    },
    slate: {
      border: 'border-[var(--ds-border-subtle)]',
      bg: 'bg-[var(--ds-bg-surface)]',
      icon: 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]',
      text: 'text-[var(--ds-text-muted)]',
    },
  };

  return colorMap[color];
}

/**
 * Retorna classes CSS para níveis do funil
 */
export function getFunnelLevelColorClasses(color: 'purple' | 'blue' | 'slate'): {
  active: string;
  inactive: string;
  arrow: string;
  ring: string;
} {
  const colorMap = {
    purple: {
      active: 'bg-primary-500/20 border-primary-500/40 text-primary-400',
      inactive: 'bg-primary-500/5 border-primary-500/10 text-primary-400/50',
      arrow: 'text-primary-500/30',
      ring: 'ring-primary-500/30',
    },
    blue: {
      active: 'bg-blue-500/20 border-blue-500/40 text-blue-400',
      inactive: 'bg-blue-500/5 border-blue-500/10 text-blue-400/50',
      arrow: 'text-blue-500/30',
      ring: 'ring-blue-500/30',
    },
    slate: {
      active: 'bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]',
      inactive: 'bg-[var(--ds-bg-surface)] border-[var(--ds-border-subtle)] text-[var(--ds-text-muted)]',
      arrow: 'text-[var(--ds-text-muted)]',
      ring: 'ring-slate-500/30',
    },
  };

  return colorMap[color];
}
