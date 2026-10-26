'use client';

import React, { useState } from 'react';
import { BookmarkPlus, Check, ChevronDown, ListFilter, Pencil, RefreshCw, Trash2, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ContactList } from '@/services/contactListService';

export interface ContactListSelectorProps {
  lists: ContactList[];
  selectedListId: string | null;
  /** Filtros atuais divergem dos filtros salvos na lista selecionada */
  isListDirty: boolean;
  /** Há filtros ativos (habilita "Salvar como lista") */
  hasActiveFilters: boolean;
  onSelectList: (id: string | null) => void;
  onSaveList: (name: string) => void;
  onUpdateListFilters: () => void;
  onRenameList: (id: string, name: string) => void;
  onDeleteList: (id: string) => void;
  isSaving?: boolean;
  isUpdating?: boolean;
  isDeleting?: boolean;
}

/**
 * Seletor de listas salvas (smart lists estilo GHL): aplica os filtros da lista
 * na listagem, com ações de salvar, atualizar, renomear e excluir.
 */
export const ContactListSelector: React.FC<ContactListSelectorProps> = ({
  lists,
  selectedListId,
  isListDirty,
  hasActiveFilters,
  onSelectList,
  onSaveList,
  onUpdateListFilters,
  onRenameList,
  onDeleteList,
  isSaving,
  isUpdating,
  isDeleting,
}) => {
  const [open, setOpen] = useState(false);

  // Modal de nome (criar ou renomear)
  const [nameModal, setNameModal] = useState<{ mode: 'create' | 'rename'; listId?: string } | null>(null);
  const [nameInput, setNameInput] = useState('');

  // Confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<ContactList | null>(null);

  const selectedList = lists.find((list) => list.id === selectedListId) || null;

  const openCreateModal = () => {
    setNameInput('');
    setNameModal({ mode: 'create' });
  };

  const openRenameModal = (list: ContactList) => {
    setNameInput(list.name);
    setNameModal({ mode: 'rename', listId: list.id });
    setOpen(false);
  };

  const handleNameSubmit = () => {
    const name = nameInput.trim();
    if (!name || !nameModal) return;
    if (nameModal.mode === 'create') {
      onSaveList(name);
    } else if (nameModal.listId) {
      onRenameList(nameModal.listId, name);
    }
    setNameModal(null);
    setNameInput('');
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteList(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Dropdown de listas */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`px-4 py-2.5 text-sm font-medium rounded-xl border transition-colors outline-none cursor-pointer flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2 ${selectedList
                ? 'text-primary-600 dark:text-primary-400 bg-primary-500/10 border-primary-500/30'
                : 'bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)]'
                }`}
              aria-label="Selecionar lista salva"
              aria-expanded={open}
            >
              <ListFilter size={16} aria-hidden="true" />
              <span className="max-w-[11rem] truncate">
                {selectedList ? selectedList.name : 'Todos os contatos'}
                {selectedList && isListDirty && ' *'}
              </span>
              <ChevronDown size={14} className="opacity-60" aria-hidden="true" />
            </button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-72 p-2 bg-[var(--ds-bg-surface)] border-[var(--ds-border-default)]">
            {/* Todos os contatos */}
            <button
              type="button"
              onClick={() => {
                onSelectList(null);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
            >
              <Users size={15} className="text-[var(--ds-text-muted)] shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left">Todos os contatos</span>
              {!selectedListId && <Check size={15} className="text-primary-600 dark:text-primary-400 shrink-0" aria-hidden="true" />}
            </button>

            {lists.length > 0 && (
              <div className="my-1.5 border-t border-[var(--ds-border-subtle)]" role="separator" />
            )}

            {/* Listas salvas */}
            {lists.map((list) => (
              <div
                key={list.id}
                className="group flex items-center gap-1 rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectList(list.id);
                    setOpen(false);
                  }}
                  className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-2 text-sm text-[var(--ds-text-primary)] text-left"
                >
                  <ListFilter size={15} className="text-[var(--ds-text-muted)] shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{list.name}</span>
                  {selectedListId === list.id && (
                    <Check size={15} className="text-primary-600 dark:text-primary-400 shrink-0" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => openRenameModal(list)}
                  className="p-1.5 rounded-md text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-elevated)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                  aria-label={`Renomear lista ${list.name}`}
                  title="Renomear"
                >
                  <Pencil size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(list);
                    setOpen(false);
                  }}
                  className="p-1.5 mr-1 rounded-md text-[var(--ds-text-muted)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                  aria-label={`Excluir lista ${list.name}`}
                  title="Excluir"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            ))}

            {lists.length === 0 && (
              <p className="px-2 py-3 text-xs text-[var(--ds-text-muted)]">
                Nenhuma lista salva ainda. Aplique filtros e clique em &quot;Salvar como lista&quot;.
              </p>
            )}
          </PopoverContent>
        </Popover>

        {/* Atualizar lista (filtros divergiram da lista selecionada) */}
        {selectedList && isListDirty && (
          <button
            type="button"
            onClick={onUpdateListFilters}
            disabled={isUpdating}
            className="px-3 py-2.5 text-sm font-medium rounded-xl border border-primary-500/30 text-primary-600 dark:text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            title={`Atualizar a lista "${selectedList.name}" com os filtros atuais`}
          >
            <RefreshCw size={14} className={isUpdating ? 'animate-spin' : undefined} aria-hidden="true" />
            Atualizar lista
          </button>
        )}

        {/* Salvar como lista (há filtros ativos) */}
        {hasActiveFilters && (!selectedList || isListDirty) && (
          <button
            type="button"
            onClick={openCreateModal}
            disabled={isSaving}
            className="px-3 py-2.5 text-sm font-medium rounded-xl border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors flex items-center gap-1.5 disabled:opacity-50"
            title="Salvar os filtros atuais como uma lista"
          >
            <BookmarkPlus size={14} aria-hidden="true" />
            Salvar como lista
          </button>
        )}
      </div>

      {/* Modal de nome (criar/renomear) */}
      <Dialog open={!!nameModal} onOpenChange={(isOpen) => { if (!isOpen) setNameModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {nameModal?.mode === 'create' ? (
                <>
                  <BookmarkPlus size={18} aria-hidden="true" />
                  Salvar como lista
                </>
              ) : (
                <>
                  <Pencil size={18} aria-hidden="true" />
                  Renomear lista
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor="contact-list-name" className="text-sm font-medium text-[var(--ds-text-secondary)]">
              Nome da lista
            </label>
            <Input
              id="contact-list-name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              placeholder="Ex.: Leads VIP de São Paulo"
              autoFocus
            />
            {nameModal?.mode === 'create' && (
              <p className="text-xs text-[var(--ds-text-muted)]">
                A lista guarda os filtros atuais — os contatos que casarem com eles entram automaticamente.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNameModal(null)}>
              Cancelar
            </Button>
            <Button onClick={handleNameSubmit} disabled={!nameInput.trim() || isSaving || isUpdating}>
              {nameModal?.mode === 'create' ? 'Salvar lista' : 'Renomear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(isOpen) => { if (!isOpen) setDeleteTarget(null); }}
        title="Excluir lista"
        description={`Tem certeza que deseja excluir a lista "${deleteTarget?.name ?? ''}"? Os contatos não serão afetados — só o filtro salvo será removido.`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};
