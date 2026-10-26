'use client';

import React from 'react';
import { Search, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter';
import { ContactSelectionListProps } from './types';

export function ContactSelectionList({
  contacts,
  selectedContactIds,
  toggleContact,
  contactSearchTerm,
  setContactSearchTerm,
  totalContacts,
  recipientCount,
  isAutoSelection,
  onSwitchToManual,
}: ContactSelectionListProps) {
  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-6 mt-6 animate-in zoom-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <h4 className="text-[var(--ds-text-primary)] font-bold text-sm">
            {isAutoSelection ? 'Contatos do segmento' : 'Seus Contatos'}
          </h4>
          {isAutoSelection && (
            <p className="text-xs text-[var(--ds-text-muted)] mt-1">
              Seleção automática. Para ajustar manualmente, troque para "Escolher
              contatos".
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-[var(--ds-text-muted)]">
            {recipientCount}/{totalContacts} selecionados
          </span>
          {isAutoSelection && onSwitchToManual && (
            <Button
              type="button"
              variant="outline"
              className="border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
              onClick={onSwitchToManual}
            >
              Editar manualmente
            </Button>
          )}
        </div>
      </div>

      {!isAutoSelection && (
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]"
          />
          <input
            type="text"
            placeholder="Buscar por nome, telefone, email ou tags..."
            value={contactSearchTerm}
            onChange={(e) => setContactSearchTerm(e.target.value)}
            className="w-full bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:border-primary-500 transition-colors"
          />
          {contactSearchTerm && (
            <button
              onClick={() => setContactSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      <div className="space-y-2 max-h-75 overflow-y-auto custom-scrollbar">
        {contacts.length === 0 ? (
          <p className="text-[var(--ds-text-muted)] text-sm text-center py-8">
            {!isAutoSelection && contactSearchTerm
              ? 'Nenhum contato encontrado para esta busca'
              : 'Nenhum contato encontrado'}
          </p>
        ) : (
          contacts.map((contact) => {
            const isSelected = selectedContactIds.includes(contact.id);
            return (
              <label
                key={contact.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-primary-500/10 border border-primary-500/30'
                    : 'bg-[var(--ds-bg-surface)] border border-transparent'
                } ${isAutoSelection ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--ds-bg-hover)]'}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {
                    if (isAutoSelection) return;
                    toggleContact(contact.id);
                  }}
                  disabled={isAutoSelection}
                  className="w-4 h-4 text-primary-600 bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)] rounded focus:ring-primary-500 disabled:opacity-50"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--ds-text-primary)] truncate">
                    {contact.name || contact.phone}
                  </p>
                  <p className="text-xs text-[var(--ds-text-muted)] font-mono">{formatPhoneNumberDisplay(contact.phone, 'e164')}</p>
                </div>
                {isSelected && (
                  <Check size={16} className="text-primary-400 shrink-0" />
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
