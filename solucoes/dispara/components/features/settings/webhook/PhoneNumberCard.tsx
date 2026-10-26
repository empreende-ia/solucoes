'use client';

import React, { useState } from 'react';
import {
  Phone,
  ChevronDown,
  Loader2,
  Check,
  CheckCircle2,
  AlertCircle,
  Circle,
} from 'lucide-react';
import { PhoneNumber } from '../../../../hooks/useSettings';
import { WebhookStatus, WebhookFunnelLevel, CardColor } from './types';
import { getCardColorClasses } from './utils';
import { WebhookFunnelVisualization } from './WebhookFunnelVisualization';

interface PhoneNumberCardProps {
  phone: PhoneNumber;
  webhookStatus: WebhookStatus;
  funnelLevels: WebhookFunnelLevel[];
  cardColor: CardColor;
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

export function PhoneNumberCard({
  phone,
  webhookStatus,
  funnelLevels,
  cardColor,
  isSavingOverride,
  onSetZapflowWebhook,
  onRemoveOverride,
  onSetCustomOverride,
  onActivateWaba,
  onDeactivateWaba,
  isWabaBusy,
}: PhoneNumberCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isFunnelExpanded, setIsFunnelExpanded] = useState(false);
  const [overrideUrl, setOverrideUrl] = useState('');
  const [isLocalSaving, setIsLocalSaving] = useState(false);

  const colors = getCardColorClasses(cardColor);

  const handleSetOverride = async () => {
    if (!overrideUrl.trim()) return;
    setIsLocalSaving(true);
    try {
      await onSetCustomOverride(phone.id, overrideUrl.trim());
      setIsEditing(false);
      setOverrideUrl('');
    } finally {
      setIsLocalSaving(false);
    }
  };

  const isBusy = isSavingOverride || isLocalSaving;

  // Handlers para o funil
  const handleActivateNumber = async () => {
    await onSetZapflowWebhook(phone.id);
  };

  const handleDeactivateNumber = async () => {
    await onRemoveOverride(phone.id);
  };

  return (
    <div
      className={'border rounded-xl overflow-hidden transition-all ' + colors.bg + ' ' + colors.border}
    >
      {/* Header Row - Always visible */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={'p-2.5 rounded-xl ' + colors.icon}>
              <Phone size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--ds-text-primary)]">{phone.display_phone_number}</div>
              <div className="text-sm text-[var(--ds-text-secondary)] truncate">
                {phone.verified_name || 'Sem nome verificado'}
              </div>
              {/* Status line */}
              <div className={'text-xs mt-1.5 flex items-center gap-1.5 ' + colors.text}>
                {webhookStatus.status === 'dispara' ? (
                  <>
                    <CheckCircle2 size={12} />
                    <span>Dispara capturando eventos</span>
                  </>
                ) : webhookStatus.status === 'other' ? (
                  <>
                    <AlertCircle size={12} />
                    <span>Outro sistema no nível #{webhookStatus.level}</span>
                  </>
                ) : webhookStatus.level === 2 ? (
                  <>
                    <Circle size={12} />
                    <span>Usando webhook da WABA</span>
                  </>
                ) : webhookStatus.level === 3 ? (
                  <>
                    <Circle size={12} />
                    <span>Usando fallback do App</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={12} />
                    <span>Nenhum webhook configurado</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Level Badge - Clickable to expand funnel */}
            <button
              onClick={() => setIsFunnelExpanded(!isFunnelExpanded)}
              className={
                'px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all hover:ring-2 hover:ring-[var(--ds-border-strong)] ' +
                (cardColor === 'purple'
                  ? 'bg-[var(--ds-status-success-bg)] text-[var(--ds-status-success-text)]'
                  : cardColor === 'amber'
                    ? 'bg-[var(--ds-status-warning-bg)] text-[var(--ds-status-warning-text)]'
                    : cardColor === 'blue'
                      ? 'bg-[var(--ds-status-info-bg)] text-[var(--ds-status-info-text)]'
                      : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]')
              }
              title="Clique para ver e configurar o funil"
            >
              {webhookStatus.level > 0 && (
                <span className="font-bold">#{webhookStatus.level}</span>
              )}
              {webhookStatus.status === 'dispara' ? 'Dispara' : webhookStatus.levelName}
              <ChevronDown
                size={12}
                className={'transition-transform ' + (isFunnelExpanded ? 'rotate-180' : '')}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Funnel Visualization - Expandable with inline actions */}
      {isFunnelExpanded && !isEditing && (
        <WebhookFunnelVisualization
          funnelLevels={funnelLevels}
          onActivateNumber={handleActivateNumber}
          onDeactivateNumber={handleDeactivateNumber}
          isNumberBusy={isBusy}
          onActivateWaba={onActivateWaba}
          onDeactivateWaba={onDeactivateWaba}
          isWabaBusy={isWabaBusy}
        />
      )}

      {/* Edit form */}
      {isEditing && (
        <div className="px-4 pb-4">
          <div className="pt-4 border-t border-[var(--ds-border-subtle)] space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1.5">
                URL do Webhook (deve ser HTTPS)
              </label>
              <input
                type="url"
                value={overrideUrl}
                onChange={(e) => setOverrideUrl(e.target.value)}
                placeholder="https://seu-sistema.com/webhook"
                className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm font-mono text-[var(--ds-text-primary)] focus:ring-2 focus:ring-[var(--ds-status-info)]/50 focus:border-[var(--ds-status-info)]/50 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setOverrideUrl('');
                }}
                className="h-10 px-4 text-sm text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSetOverride}
                disabled={isLocalSaving || !overrideUrl.trim()}
                className="h-10 px-4 bg-[var(--ds-status-info)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isLocalSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
