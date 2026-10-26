'use client'

import React from 'react'
import Link from 'next/link'
import { FileText, Check, Loader2, Trash2, Eye, Pencil, Send, Megaphone } from 'lucide-react'
import { Template } from '../../../../types'
import { StatusBadge } from './StatusBadge'
import { Button } from '@/components/ui/button'

export interface TemplateCardProps {
  template: Template
  isManualDraft: boolean
  isRowSelected: boolean
  isSubmitting: boolean
  isDeletingDraft: boolean
  canSend: boolean
  sendReason?: string
  // Selection handlers
  onToggleSelection: () => void
  // Actions
  onViewDetails: () => void
  onDeleteClick: () => void
  onSubmitDraft: () => void
  onDeleteDraft: () => void
  onCreateCampaign?: () => void
}

/**
 * Card mobile para exibir um template
 * Substitui TemplateTableRow em viewports < lg
 * Memoizado para evitar re-renders desnecessarios
 */
export const TemplateCard = React.memo(
  function TemplateCard({
    template,
    isManualDraft,
    isRowSelected,
    isSubmitting,
    isDeletingDraft,
    canSend,
    sendReason,
    onToggleSelection,
    onViewDetails,
    onDeleteClick,
    onSubmitDraft,
    onDeleteDraft,
    onCreateCampaign,
  }: TemplateCardProps) {
    const draftHref = `/templates/drafts/${encodeURIComponent(template.id)}`

    const handleCardClick = () => {
      if (!isManualDraft) {
        onViewDetails()
      }
    }

  return (
    <div
      className={`p-4 border rounded-xl transition-colors ${
        isRowSelected
          ? isManualDraft
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-primary-500/40 bg-primary-500/5'
          : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]'
      }`}
    >
      {/* Header: Checkbox, Nome, Status */}
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelection()
          }}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
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

        {/* Nome e status */}
        <div className="flex-1 min-w-0" onClick={handleCardClick}>
          {isManualDraft ? (
            <Link href={draftHref} className="block">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-[var(--ds-text-secondary)] shrink-0" />
                <span className="font-medium text-[var(--ds-text-primary)] truncate">{template.name}</span>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2 cursor-pointer">
              <FileText size={14} className="text-[var(--ds-text-secondary)] shrink-0" />
              <span className="font-medium text-[var(--ds-text-primary)] truncate">{template.name}</span>
            </div>
          )}

          {/* Categoria e Idioma */}
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 font-medium ${
                template.category === 'UTILIDADE'
                  ? 'bg-green-500/10 text-[var(--ds-status-success-text)] border-green-500/20'
                  : template.category === 'MARKETING'
                    ? 'bg-amber-500/10 text-[var(--ds-status-warning-text)] border-amber-500/20'
                    : 'bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] border-[var(--ds-border-default)]'
              }`}
            >
              {template.category}
            </span>
            <span className="text-[var(--ds-text-muted)] font-mono">{template.language}</span>
          </div>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          <StatusBadge status={template.status} />
        </div>
      </div>

      {/* Content preview */}
      <div className="mt-3" onClick={handleCardClick}>
        <p className="text-sm text-[var(--ds-text-secondary)] line-clamp-2">
          {template.content || <span className="italic">Sem conteudo</span>}
        </p>
      </div>

      {/* Footer: Data e Ações */}
      <div className="mt-3 flex items-center justify-between pt-3 border-t border-[var(--ds-border-subtle)]">
        <span className="text-xs text-[var(--ds-text-muted)] font-mono">
          {new Date(template.lastUpdated).toLocaleDateString('pt-BR')}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isManualDraft ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={draftHref} title="Continuar edicao">
                  <Pencil size={14} />
                  <span className="hidden xs:inline">Editar</span>
                </Link>
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onSubmitDraft()
                }}
                disabled={!canSend || isSubmitting || isDeletingDraft}
                title={!canSend ? sendReason || 'Corrija o template antes de enviar' : 'Enviar pra Meta'}
              >
                {isSubmitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span className="hidden xs:inline">Enviar</span>
              </Button>
              <Button
                variant="ghost-destructive"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteDraft()
                }}
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
                onClick={(e) => {
                  e.stopPropagation()
                  onViewDetails()
                }}
                title="Ver detalhes"
              >
                <Eye size={16} />
              </Button>
              {template.status === 'APPROVED' && onCreateCampaign && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreateCampaign()
                  }}
                  title="Criar campanha"
                >
                  <Megaphone size={16} />
                </Button>
              )}
              <Button
                variant="ghost-destructive"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteClick()
                }}
                title="Deletar template"
              >
                <Trash2 size={16} />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
  },
  // Custom comparison - re-render only when relevant props change
  (prev, next) => (
    prev.template.id === next.template.id &&
    prev.template.status === next.template.status &&
    prev.template.name === next.template.name &&
    prev.template.lastUpdated === next.template.lastUpdated &&
    prev.isManualDraft === next.isManualDraft &&
    prev.isRowSelected === next.isRowSelected &&
    prev.isSubmitting === next.isSubmitting &&
    prev.isDeletingDraft === next.isDeletingDraft &&
    prev.canSend === next.canSend
  )
)

/**
 * Lista de cards para templates (versao mobile)
 */
export interface TemplateCardListProps {
  templates: Template[]
  isLoading: boolean
  manualDraftIds: Set<string>
  manualDraftSendStateById?: Record<string, { canSend: boolean; reason?: string }>
  selectedManualDraftIds: Set<string>
  selectedMetaTemplates: Set<string>
  onToggleManualDraft: (id: string) => void
  onToggleMetaTemplate: (name: string) => void
  submittingManualDraftId: string | null
  deletingManualDraftId: string | null
  submitManualDraft: (id: string) => void
  deleteManualDraft: (id: string) => void
  onViewDetails: (template: Template) => void
  onDeleteClick: (template: Template) => void
  onCreateCampaign?: (template: Template) => void
}

export const TemplateCardList: React.FC<TemplateCardListProps> = ({
  templates,
  isLoading,
  manualDraftIds,
  manualDraftSendStateById,
  selectedManualDraftIds,
  selectedMetaTemplates,
  onToggleManualDraft,
  onToggleMetaTemplate,
  submittingManualDraftId,
  deletingManualDraftId,
  submitManualDraft,
  deleteManualDraft,
  onViewDetails,
  onDeleteClick,
  onCreateCampaign,
}) => {
  const isManualDraft = (t: Template) => manualDraftIds?.has(t.id)

  const canSendDraft = (t: Template) => {
    const state = manualDraftSendStateById?.[t.id]
    if (state) return state.canSend
    return String(t.content || '').trim().length > 0
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-[var(--ds-text-secondary)]">
        Carregando templates...
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 bg-[var(--ds-bg-surface)] rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--ds-text-muted)]">
          <FileText size={32} />
        </div>
        <h3 className="text-lg font-bold text-[var(--ds-text-primary)] mb-1">Nenhum template encontrado</h3>
        <p className="text-[var(--ds-text-muted)] text-sm">
          Tente ajustar os filtros ou clique em sincronizar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {templates.map((template) => {
        const manual = isManualDraft(template)
        const isSelected = manual
          ? selectedManualDraftIds.has(template.id)
          : selectedMetaTemplates.has(template.name)

        return (
          <TemplateCard
            key={template.id}
            template={template}
            isManualDraft={manual}
            isRowSelected={isSelected}
            isSubmitting={submittingManualDraftId === template.id}
            isDeletingDraft={deletingManualDraftId === template.id}
            canSend={canSendDraft(template)}
            sendReason={manualDraftSendStateById?.[template.id]?.reason}
            onToggleSelection={() =>
              manual ? onToggleManualDraft(template.id) : onToggleMetaTemplate(template.name)
            }
            onViewDetails={() => onViewDetails(template)}
            onDeleteClick={() => onDeleteClick(template)}
            onSubmitDraft={() => submitManualDraft(template.id)}
            onDeleteDraft={() => deleteManualDraft(template.id)}
            onCreateCampaign={onCreateCampaign ? () => onCreateCampaign(template) : undefined}
          />
        )
      })}
    </div>
  )
}
