'use client';

import React from 'react';
import { Phone, Loader2, AlertTriangle } from 'lucide-react';
import { PhoneNumber } from '../../../../hooks/useSettings';
import { getWebhookStatus, getWebhookFunnelLevels, getCardColor } from './utils';
import { PhoneNumberCard } from './PhoneNumberCard';

interface PhoneNumbersListProps {
  phoneNumbers?: PhoneNumber[];
  phoneNumbersLoading?: boolean;
  computedWebhookUrl?: string;
  isSavingOverride: boolean;
  onSetZapflowWebhook: (phoneId: string) => Promise<boolean | void>;
  onRemoveOverride: (phoneId: string) => Promise<boolean | void>;
  onSetCustomOverride: (phoneId: string, url: string) => Promise<boolean | void>;
  // Ações WABA (#2)
  onActivateWaba?: () => Promise<void>;
  onDeactivateWaba?: () => Promise<void>;
  isWabaBusy?: boolean;
}

export function PhoneNumbersList({
  phoneNumbers,
  phoneNumbersLoading,
  computedWebhookUrl,
  isSavingOverride,
  onSetZapflowWebhook,
  onRemoveOverride,
  onSetCustomOverride,
  onActivateWaba,
  onDeactivateWaba,
  isWabaBusy,
}: PhoneNumbersListProps) {
  if (!phoneNumbers || phoneNumbers.length === 0) {
    return null;
  }

  // Check for numbers with external webhook
  const numbersWithExternalWebhook = phoneNumbers.filter((phone) => {
    const status = getWebhookStatus(phone, computedWebhookUrl);
    return status.status === 'other';
  });

  return (
    <>
      {/* Warning Banner - Webhook pointing to another system */}
      {numbersWithExternalWebhook.length > 0 && (
        <div className="mb-4 p-4 bg-[var(--ds-status-warning-bg)] border border-[var(--ds-status-warning)]/30 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[var(--ds-status-warning)]/20 rounded-lg shrink-0">
              <AlertTriangle size={20} className="text-[var(--ds-status-warning-text)]" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-[var(--ds-status-warning-text)] mb-1">
                Webhook apontando para outro sistema
              </h4>
              <p className="text-sm text-[var(--ds-text-secondary)]">
                {numbersWithExternalWebhook.length === 1
                  ? `O número ${numbersWithExternalWebhook[0].display_phone_number} está enviando webhooks para outro sistema.`
                  : `${numbersWithExternalWebhook.length} números estão enviando webhooks para outros sistemas.`}{' '}
                Os status de entrega (Entregue, Lido) <strong>não serão atualizados</strong>{' '}
                neste app.
              </p>
              <p className="text-xs text-[var(--ds-text-muted)] mt-2">
                Expanda o funil e clique em "Ativar" no nível desejado para corrigir.
              </p>
            </div>
          </div>
        </div>
      )}

      <h4 className="font-medium text-[var(--ds-text-primary)] mb-3 flex items-center gap-2">
        <Phone size={16} className="text-[var(--ds-text-muted)]" />
        Seus Números
      </h4>

      {phoneNumbersLoading ? (
        <div className="flex items-center justify-center py-8 text-[var(--ds-text-muted)]">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando números...
        </div>
      ) : (
        <div className="space-y-3">
          {phoneNumbers.map((phone) => {
            const webhookStatus = getWebhookStatus(phone, computedWebhookUrl);
            const funnelLevels = getWebhookFunnelLevels(phone, computedWebhookUrl);
            const cardColor = getCardColor(webhookStatus);

            return (
              <PhoneNumberCard
                key={phone.id}
                phone={phone}
                webhookStatus={webhookStatus}
                funnelLevels={funnelLevels}
                cardColor={cardColor}
                computedWebhookUrl={computedWebhookUrl}
                isSavingOverride={isSavingOverride}
                onSetZapflowWebhook={onSetZapflowWebhook}
                onRemoveOverride={onRemoveOverride}
                onSetCustomOverride={onSetCustomOverride}
                onActivateWaba={onActivateWaba}
                onDeactivateWaba={onDeactivateWaba}
                isWabaBusy={isWabaBusy}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
