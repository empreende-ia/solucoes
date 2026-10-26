'use client';

import React from 'react';
import { Search, Filter, RefreshCw, Eye, Ban, AlertCircle, Pencil, Loader2 } from 'lucide-react';
import { MessageStatus } from '@/types';
import { humanizePrecheckReason } from '@/lib/precheck-humanizer';
import { Container } from '@/components/ui/container';
import { MessageStatusBadge } from './MessageStatusBadge';
import { MessageLogTableProps } from './types';

export const MessageLogTable: React.FC<MessageLogTableProps> = ({
  messages,
  messageStats,
  searchTerm,
  setSearchTerm,
  filterStatus,
  includeReadInDelivered,
  setIncludeReadInDelivered,
  canLoadMore,
  onLoadMore,
  isLoadingMore,
  onQuickEditContact,
}) => {
  const total = Number(messageStats?.total ?? messages.length);
  const shown = Number(messages.length);
  const showLoadMore = Boolean(canLoadMore && onLoadMore);
  const showPagination = total > 0 && shown < total;

  return (
    <Container variant="glass" padding="none" className="overflow-hidden">
      <div className="p-5 border-b border-[var(--ds-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="font-bold text-[var(--ds-text-primary)] flex items-center gap-2">
          Logs de Envio{' '}
          <span className="text-xs font-normal text-[var(--ds-text-muted)] bg-[var(--ds-bg-surface)] px-2 py-0.5 rounded-full">
            {total.toLocaleString()}
          </span>
        </h3>

        <div className="flex gap-2">
          {filterStatus === MessageStatus.DELIVERED && setIncludeReadInDelivered && (
            <button
              type="button"
              onClick={() => setIncludeReadInDelivered(!includeReadInDelivered)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-2 ${
                includeReadInDelivered
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/15'
                  : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
              }`}
              title={includeReadInDelivered
                ? 'Mostrando entregues + lidas (cumulativo)'
                : 'Mostrando apenas entregues (nao lidas)'}
            >
              <Eye size={14} />
              {includeReadInDelivered ? 'Inclui lidas' : 'So nao lidas'}
            </button>
          )}

          <div className="relative w-full sm:w-64 group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] group-focus-within:text-primary-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar destinatário..."
              className="w-full bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-full py-1.5 pl-9 pr-3 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 text-sm transition-all text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)] outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="p-1.5 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg border border-[var(--ds-border-subtle)] transition-colors">
            <Filter size={16} />
          </button>
          <button className="p-1.5 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg border border-[var(--ds-border-subtle)] transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-muted)] uppercase text-xs tracking-widest">
            <tr>
              <th className="px-6 py-3 font-medium">Destinatário</th>
              <th className="px-6 py-3 font-medium">Telefone</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Horário</th>
              <th className="px-6 py-3 font-medium">Info</th>
              <th className="px-6 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ds-border-subtle)]">
            {messages.map((msg) => (
              <tr key={msg.id} className="hover:bg-[var(--ds-bg-hover)] transition-colors">
                <td className="px-6 py-3 font-medium text-[var(--ds-text-primary)]">{msg.contactName}</td>
                <td className="px-6 py-3 font-mono text-xs text-[var(--ds-text-muted)]">{msg.contactPhone}</td>
                <td className="px-6 py-3">
                  <MessageStatusBadge status={msg.status} />
                </td>
                <td className="px-6 py-3 text-[var(--ds-text-muted)] text-xs">{msg.sentAt}</td>
                <td className="px-6 py-3">
                  {msg.error ? (
                    <span
                      className={`text-xs flex items-center gap-1 ${
                        msg.status === MessageStatus.SKIPPED
                          ? 'text-amber-300'
                          : 'text-red-400'
                      }`}
                    >
                      {msg.status === MessageStatus.SKIPPED ? <Ban size={10} /> : <AlertCircle size={10} />}
                      {(() => {
                        const h = humanizePrecheckReason(String(msg.error || ''));
                        return (
                          <span>{h.title}</span>
                        );
                      })()}
                    </span>
                  ) : (
                    <span className="text-[var(--ds-text-muted)] text-xs">-</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  {msg.contactId && msg.status === MessageStatus.SKIPPED && msg.error ? (
                    <button
                      onClick={() => {
                        const h = humanizePrecheckReason(String(msg.error));
                        onQuickEditContact(msg.contactId!, h?.focus || null);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                      title="Corrigir contato sem sair da campanha"
                    >
                      <Pencil size={12} /> Corrigir contato
                    </button>
                  ) : (
                    <span className="text-[var(--ds-text-muted)] text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
            {messages.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-[var(--ds-text-muted)]">Nenhum registro encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>

        {showPagination && (
          <div className="p-4 border-t border-[var(--ds-border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-[var(--ds-text-muted)]">
              Mostrando <span className="font-mono text-[var(--ds-text-secondary)]">{shown}</span> de{' '}
              <span className="font-mono text-[var(--ds-text-secondary)]">{total}</span>
            </div>

            {showLoadMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={!!isLoadingMore}
                className="px-3 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-lg text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-2 text-xs font-medium disabled:opacity-50"
              >
                {isLoadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                {isLoadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            ) : (
              <div className="text-xs text-[var(--ds-text-muted)]">(Esta tela carrega ate 100 por vez)</div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
};
