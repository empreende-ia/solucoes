'use client'

import React from 'react'
import {
  Banknote,
  CircleUser,
  Clock,
  MoreVertical,
  Pencil,
  RotateCcw,
  ThumbsDown,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/date-utils'
import type { Opportunity, OpportunityStatus } from '@/services/crmService'
import { formatBRL, getOpportunityContactLabel } from './crm-format'

/** Badge de status da oportunidade (exibido quando != open), com par claro/escuro */
const STATUS_BADGES: Record<Exclude<OpportunityStatus, 'open'>, { label: string; className: string }> = {
  won: {
    label: 'Ganha',
    className: 'bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/30',
  },
  lost: {
    label: 'Perdida',
    className: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  },
  abandoned: {
    label: 'Abandonada',
    className: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/30',
  },
}

export interface OpportunityCardProps {
  opportunity: Opportunity
  isDragging: boolean
  onDragStart: (e: React.DragEvent, opportunity: Opportunity) => void
  onDragEnd: () => void
  onChangeStatus: (opportunity: Opportunity, status: OpportunityStatus) => void
  onEdit: (opportunity: Opportunity) => void
  onDelete: (opportunity: Opportunity) => void
}

/**
 * Card de oportunidade do kanban.
 * Arrastável via HTML5 drag and drop nativo.
 */
export function OpportunityCard({
  opportunity,
  isDragging,
  onDragStart,
  onDragEnd,
  onChangeStatus,
  onEdit,
  onDelete,
}: OpportunityCardProps) {
  const contactLabel = getOpportunityContactLabel(opportunity)
  const badge = opportunity.status !== 'open' ? STATUS_BADGES[opportunity.status] : null

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, opportunity)}
      onDragEnd={onDragEnd}
      className={cn(
        'group rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-3',
        'cursor-grab active:cursor-grabbing select-none',
        'hover:border-[var(--ds-border-strong)] hover:shadow-sm transition-all',
        isDragging && 'opacity-40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--ds-text-primary)] leading-snug break-words min-w-0">
          {opportunity.name}
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="shrink-0 p-1 rounded-md text-[var(--ds-text-muted)] opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] transition-colors"
              aria-label="Ações da oportunidade"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {opportunity.status !== 'won' && (
              <DropdownMenuItem onClick={() => onChangeStatus(opportunity, 'won')}>
                <Trophy className="text-primary-600 dark:text-primary-400" />
                Marcar como ganha
              </DropdownMenuItem>
            )}
            {opportunity.status !== 'lost' && (
              <DropdownMenuItem onClick={() => onChangeStatus(opportunity, 'lost')}>
                <ThumbsDown className="text-red-600 dark:text-red-400" />
                Marcar como perdida
              </DropdownMenuItem>
            )}
            {opportunity.status !== 'abandoned' && (
              <DropdownMenuItem onClick={() => onChangeStatus(opportunity, 'abandoned')}>
                <XCircle className="text-zinc-500 dark:text-zinc-400" />
                Marcar como abandonada
              </DropdownMenuItem>
            )}
            {opportunity.status !== 'open' && (
              <DropdownMenuItem onClick={() => onChangeStatus(opportunity, 'open')}>
                <RotateCcw />
                Reabrir
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(opportunity)}>
              <Pencil />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(opportunity)}>
              <Trash2 />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {contactLabel && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--ds-text-secondary)]">
          <CircleUser className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{contactLabel}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {opportunity.value !== null && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 dark:text-primary-400">
              <Banknote className="w-3.5 h-3.5" />
              {formatBRL(opportunity.value)}
            </span>
          )}
          {badge && (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
                badge.className
              )}
            >
              {badge.label}
            </span>
          )}
        </div>

        <span
          className="inline-flex items-center gap-1 text-[10px] text-[var(--ds-text-muted)] whitespace-nowrap"
          title="Tempo na etapa atual"
        >
          <Clock className="w-3 h-3" />
          {formatRelativeTime(opportunity.stageChangedAt)}
        </span>
      </div>
    </div>
  )
}
