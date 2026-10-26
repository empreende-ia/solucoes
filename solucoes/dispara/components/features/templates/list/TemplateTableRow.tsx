'use client';

import React from 'react';
import Link from 'next/link';
import { FileText, Check, Loader2, Trash2, Eye, Send, Megaphone, Copy } from 'lucide-react';
import { Template } from '../../../../types';
import { StatusBadge } from './StatusBadge';
import { Button } from '@/components/ui/button';
import { WhatsAppInlineText } from '@/components/ui/whatsapp-text';

export interface TemplateTableRowProps {
  template: Template;
  isManualDraft: boolean;
  isRowSelected: boolean;
  isSubmitting: boolean;
  isDeletingDraft: boolean;
  isCloning?: boolean;
  canSend: boolean;
  sendReason?: string;
  // Selection handlers
  onToggleSelection: () => void;
  // Actions
  onViewDetails: () => void;
  onDeleteClick: () => void;
  onSubmitDraft: () => void;
  onDeleteDraft: () => void;
  onCreateCampaign?: () => void;
  onCloneTemplate?: () => void;
  // Hover handlers
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onPrefetchPreview?: () => void;
}

const TemplateTableRowComponent: React.FC<TemplateTableRowProps> = ({
  template,
  isManualDraft,
  isRowSelected,
  isSubmitting,
  isDeletingDraft,
  isCloning,
  canSend,
  sendReason,
  onToggleSelection,
  onViewDetails,
  onDeleteClick,
  onSubmitDraft,
  onDeleteDraft,
  onCreateCampaign,
  onCloneTemplate,
  onMouseEnter,
  onMouseLeave,
  onPrefetchPreview,
}) => {
  const draftHref = `/templates/drafts/${encodeURIComponent(template.id)}`;

  const handleCellClick = () => {
    if (!isManualDraft) {
      onViewDetails();
    }
  };

  // Handler para hover no ícone de preview (Eye)
  const handlePreviewEnter = () => {
    onMouseEnter();
    if (!isManualDraft && onPrefetchPreview) {
      onPrefetchPreview();
    }
  };

  return (
    <tr
      className={`hover:bg-[var(--ds-bg-hover)] transition-colors group cursor-pointer ${
        isRowSelected ? (isManualDraft ? 'bg-amber-500/5' : 'bg-primary-500/5') : ''
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Checkbox */}
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleSelection}
          className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
            isRowSelected
              ? isManualDraft
                ? 'bg-amber-500 border-amber-500'
                : 'bg-primary-500 border-primary-500'
              : 'border-[var(--ds-border-default)] hover:border-[var(--ds-border-strong)]'
          }`}
          title={isRowSelected ? 'Desmarcar' : 'Selecionar'}
        >
          {isRowSelected && (
            <Check className={`w-3 h-3 ${isManualDraft ? 'text-black' : 'text-[var(--ds-text-primary)]'}`} />
          )}
        </button>
      </td>

      {/* Name */}
      <td className="px-4 py-4" onClick={handleCellClick}>
        {isManualDraft ? (
          <Link
            href={draftHref}
            className="flex items-center gap-3 hover:opacity-90"
            title="Continuar edicao"
          >
            <div className="p-2 bg-[var(--ds-bg-elevated)] rounded-lg text-[var(--ds-text-secondary)] group-hover:text-primary-200 transition-colors">
              <FileText size={16} />
            </div>
            <span
              className="font-medium text-[var(--ds-text-primary)] group-hover:text-primary-200 transition-colors truncate max-w-50"
              title={template.name}
            >
              {template.name}
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--ds-bg-elevated)] rounded-lg text-[var(--ds-text-secondary)] group-hover:text-primary-200 transition-colors">
              <FileText size={16} />
            </div>
            <span
              className="font-medium text-[var(--ds-text-primary)] group-hover:text-primary-200 transition-colors truncate max-w-50"
              title={template.name}
            >
              {template.name}
            </span>
          </div>
        )}
      </td>

      {/* Status */}
      <td className="px-2 py-4" onClick={handleCellClick}>
        {isManualDraft ? (
          <Link href={draftHref} className="inline-block" title="Continuar edicao">
            <StatusBadge status={template.status} />
          </Link>
        ) : (
          <StatusBadge status={template.status} />
        )}
      </td>

      {/* Category */}
      <td className="px-2 py-4" onClick={handleCellClick}>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${
            template.category === 'UTILIDADE'
              ? 'bg-green-500/10 text-[var(--ds-status-success-text)] border-green-500/20'
              : template.category === 'MARKETING'
                ? 'bg-amber-500/10 text-[var(--ds-status-warning-text)] border-amber-500/20'
                : 'bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] border-[var(--ds-border-default)]'
          }`}
        >
          {template.category}
        </span>
      </td>

      {/* Content */}
      <td className="px-3 py-4" onClick={handleCellClick}>
        {isManualDraft ? (
          <Link href={draftHref} className="block" title="Continuar edicao">
            <p className="text-sm text-[var(--ds-text-secondary)] truncate" title={template.content}>
              <WhatsAppInlineText text={template.content.replace(/\n/g, ' ').slice(0, 80) + (template.content.length > 80 ? '...' : '')} />
            </p>
          </Link>
        ) : (
          <p className="text-sm text-[var(--ds-text-secondary)] truncate" title={template.content}>
            <WhatsAppInlineText text={template.content.replace(/\n/g, ' ').slice(0, 80) + (template.content.length > 80 ? '...' : '')} />
          </p>
        )}
      </td>

      {/* Updated */}
      <td
        className="px-2 py-4 text-[var(--ds-text-muted)] font-mono text-xs whitespace-nowrap"
        onClick={handleCellClick}
      >
        {isManualDraft ? (
          <Link href={draftHref} className="hover:text-[var(--ds-text-secondary)]" title="Continuar edicao">
            {new Date(template.lastUpdated).toLocaleDateString('pt-BR')}
          </Link>
        ) : (
          new Date(template.lastUpdated).toLocaleDateString('pt-BR')
        )}
      </td>

      {/* Actions */}
      <td className="px-2 py-4 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {isManualDraft ? (
            <>
              <Button
                variant="brand"
                size="sm"
                onClick={onSubmitDraft}
                disabled={!canSend || isSubmitting || isDeletingDraft}
                title={!canSend ? sendReason || 'Corrija o template antes de enviar' : 'Enviar pra Meta'}
              >
                {isSubmitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Enviar pra Meta
              </Button>
              <Button
                variant="ghost-destructive"
                size="icon-sm"
                onClick={onDeleteDraft}
                disabled={isSubmitting || isDeletingDraft}
                title="Excluir rascunho"
              >
                {isDeletingDraft ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onViewDetails}
                title="Ver detalhes"
              >
                <Eye size={16} />
              </Button>
              {onCloneTemplate && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onCloneTemplate}
                  disabled={isCloning}
                  title="Clonar como rascunho"
                >
                  {isCloning ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Copy size={16} />
                  )}
                </Button>
              )}
              {template.status === 'APPROVED' && onCreateCampaign && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onCreateCampaign}
                  title="Criar campanha com este template"
                >
                  <Megaphone size={16} />
                </Button>
              )}
              <Button
                variant="ghost-destructive"
                size="icon-sm"
                onClick={onDeleteClick}
                title="Deletar template"
              >
                <Trash2 size={16} />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

// Memoização com comparação customizada para evitar re-renders desnecessários
// Compara apenas props que afetam o visual, ignora funções (mudam a cada render do parent)
export const TemplateTableRow = React.memo(TemplateTableRowComponent, (prev, next) => {
  // Se qualquer prop visual mudou, deve re-renderizar (retorna false)
  if (prev.template.id !== next.template.id) return false;
  if (prev.template.name !== next.template.name) return false;
  if (prev.template.status !== next.template.status) return false;
  if (prev.template.category !== next.template.category) return false;
  if (prev.template.content !== next.template.content) return false;
  if (prev.template.lastUpdated !== next.template.lastUpdated) return false;
  if (prev.isManualDraft !== next.isManualDraft) return false;
  if (prev.isRowSelected !== next.isRowSelected) return false;
  if (prev.isSubmitting !== next.isSubmitting) return false;
  if (prev.isDeletingDraft !== next.isDeletingDraft) return false;
  if (prev.isCloning !== next.isCloning) return false;
  if (prev.canSend !== next.canSend) return false;
  if (prev.sendReason !== next.sendReason) return false;

  // Se chegou aqui, nada visual mudou - pode pular o re-render
  return true;
});
