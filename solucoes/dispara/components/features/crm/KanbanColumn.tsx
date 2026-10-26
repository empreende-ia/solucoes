'use client'

import React from 'react'
import { Inbox, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Opportunity, OpportunityStatus } from '@/services/crmService'
import type { StageColumn } from '@/hooks/useCrm'
import { OpportunityCard } from './OpportunityCard'
import { formatBRL } from './crm-format'

export interface KanbanColumnProps {
  column: StageColumn
  isDragOver: boolean
  draggingId: string | null
  onDragStartCard: (e: React.DragEvent, opportunity: Opportunity) => void
  onDragEndCard: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onAddOpportunity: (stageId: string) => void
  onChangeStatus: (opportunity: Opportunity, status: OpportunityStatus) => void
  onEditOpportunity: (opportunity: Opportunity) => void
  onDeleteOpportunity: (opportunity: Opportunity) => void
}

/**
 * Coluna do kanban (= etapa do pipeline).
 * Alvo de drop do drag and drop nativo; realce via tokens quando é o alvo.
 */
export function KanbanColumn({
  column,
  isDragOver,
  draggingId,
  onDragStartCard,
  onDragEndCard,
  onDragOver,
  onDragLeave,
  onDrop,
  onAddOpportunity,
  onChangeStatus,
  onEditOpportunity,
  onDeleteOpportunity,
}: KanbanColumnProps) {
  const { stage, opportunities, totalValue } = column

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'flex flex-col h-full w-[300px] min-w-[280px] shrink-0 rounded-xl border transition-colors',
        isDragOver
          ? 'border-[var(--ds-border-focus)] bg-[var(--ds-brand-primary-muted)]'
          : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/60'
      )}
    >
      {/* Header da coluna: nome + contagem + soma em BRL + botão de nova oportunidade */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--ds-text-primary)] truncate">
              {stage.name}
            </h3>
            <span className="shrink-0 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[var(--ds-bg-hover)] text-xs font-medium text-[var(--ds-text-secondary)]">
              {opportunities.length}
            </span>
          </div>
          <button
            onClick={() => onAddOpportunity(stage.id)}
            className="shrink-0 p-1 rounded-md text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            aria-label={`Nova oportunidade em ${stage.name}`}
            title="Nova oportunidade"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
          {formatBRL(totalValue)}
        </p>
      </div>

      {/* Cards da etapa */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2">
        {opportunities.length === 0 ? (
          <div className="mx-1 mt-1 rounded-lg border border-dashed border-[var(--ds-border-default)] px-3 py-6 text-center">
            <Inbox className="w-5 h-5 mx-auto mb-2 text-[var(--ds-text-disabled)]" />
            <p className="text-xs text-[var(--ds-text-muted)]">
              Sem oportunidades. Arraste um card para cá ou clique em +.
            </p>
          </div>
        ) : (
          opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              isDragging={draggingId === opportunity.id}
              onDragStart={onDragStartCard}
              onDragEnd={onDragEndCard}
              onChangeStatus={onChangeStatus}
              onEdit={onEditOpportunity}
              onDelete={onDeleteOpportunity}
            />
          ))
        )}
      </div>
    </div>
  )
}
