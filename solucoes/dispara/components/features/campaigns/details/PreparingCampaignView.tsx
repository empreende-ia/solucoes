'use client';

import React from 'react';
import { ChevronLeft, Clock, CheckCircle2, Ban, FileText, Loader2, AlertCircle } from 'lucide-react';
import { PrefetchLink } from '@/components/ui/PrefetchLink';
import { Page, PageHeader, PageTitle } from '@/components/ui/page';
import { Container } from '@/components/ui/container';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageStatus } from '@/types';
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter';
import { MessageStatusBadge } from './MessageStatusBadge';
import { PreparingCampaignViewProps } from './types';

export const PreparingCampaignView: React.FC<PreparingCampaignViewProps> = ({
  campaign,
  messages,
}) => {
  const recipientsCount =
    Number(campaign.recipients || 0)
    || (Array.isArray(campaign.pendingContacts) ? campaign.pendingContacts.length : 0)
    || (Array.isArray(messages) ? messages.length : 0)
    || 0;

  return (
    <Page className="pb-20">
      <PageHeader>
        <div className="min-w-0">
          <PrefetchLink
            href="/campaigns"
            className="text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] mb-2 inline-flex items-center gap-1 transition-colors"
          >
            <ChevronLeft size={12} /> Voltar para Lista
          </PrefetchLink>

          <div className="flex flex-wrap items-center gap-2">
            <PageTitle className="flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-primary-400" />
              Preparando campanha...
            </PageTitle>
            <span className="text-xs px-2 py-1 rounded border bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]">
              {campaign.status}
            </span>
          </div>

          <p className="text-[var(--ds-text-secondary)] text-sm mt-1">
            {campaign.name} - {recipientsCount} destinatario(s)
            {campaign.templateName ? (
              <span className="ml-2">- Template: <span className="font-medium">{campaign.templateName}</span></span>
            ) : null}
          </p>
        </div>
      </PageHeader>

      <div className="mt-8 space-y-6">
        <Container variant="glass" padding="lg">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Loader2 size={18} className="animate-spin text-primary-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[var(--ds-text-primary)] font-semibold">Estamos preparando o envio</h3>
              <p className="text-sm text-[var(--ds-text-secondary)] mt-1">
                Isso pode levar alguns segundos (principalmente com listas maiores). Assim que o pre-check terminar,
                esta tela muda automaticamente para o envio ao vivo.
              </p>

              <div className="mt-5 grid gap-2 text-sm">
                <div className="flex items-center gap-2 text-[var(--ds-text-secondary)]">
                  <Clock size={14} className="text-[var(--ds-text-muted)]" />
                  Validando contatos e normalizando telefones
                </div>
                <div className="flex items-center gap-2 text-[var(--ds-text-secondary)]">
                  <Ban size={14} className="text-[var(--ds-text-muted)]" />
                  Verificando opt-out e supressões
                </div>
                <div className="flex items-center gap-2 text-[var(--ds-text-secondary)]">
                  <FileText size={14} className="text-[var(--ds-text-muted)]" />
                  Preparando registros para envio (campanha_contatos)
                </div>
                <div className="flex items-center gap-2 text-[var(--ds-text-secondary)]">
                  <CheckCircle2 size={14} className="text-[var(--ds-text-muted)]" />
                  Enfileirando o workflow de disparo
                </div>
              </div>
            </div>
          </div>
        </Container>

        {Array.isArray(campaign.pendingContacts) && campaign.pendingContacts.length > 0 && (
          <Container variant="glass" padding="lg">
            <h4 className="text-[var(--ds-text-primary)] font-semibold">Prévia dos destinatários</h4>
            <p className="text-sm text-[var(--ds-text-secondary)] mt-1">
              Lista carregada localmente (a ordem final pode mudar apos o pre-check).
            </p>

            <div className="mt-4 divide-y divide-[var(--ds-border-subtle)]">
              {campaign.pendingContacts.slice(0, 8).map((c, idx) => (
                <div key={`${c.phone}_${idx}`} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--ds-text-primary)] truncate">{c.name || 'Contato'}</div>
                    <div className="text-xs text-[var(--ds-text-secondary)] truncate">{formatPhoneNumberDisplay(c.phone, 'e164')}</div>
                  </div>
                  <MessageStatusBadge status={MessageStatus.PENDING} />
                </div>
              ))}

              {campaign.pendingContacts.length > 8 && (
                <div className="pt-3 text-xs text-[var(--ds-text-muted)]">
                  + {campaign.pendingContacts.length - 8} outro(s)...
                </div>
              )}
            </div>
          </Container>
        )}

        <Alert variant="info" hideIcon={false}>
          <AlertDescription>
            Se ficar preso aqui por mais de 1-2 minutos, verifique sua configuração da Meta/Supabase e tente novamente.
          </AlertDescription>
        </Alert>
      </div>
    </Page>
  );
};
