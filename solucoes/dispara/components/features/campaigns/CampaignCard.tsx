'use client'

import React from 'react'
import { Copy, Trash2, Calendar, Play, Pause, Loader2, Users, FolderIcon } from 'lucide-react'
import { Campaign, CampaignStatus } from '../../../types'
import { formatDateFull, formatDateTimeFull } from '@/lib/date-formatter'
import { StatusBadge as DsStatusBadge } from '@/components/ui/status-badge'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { CampaignTagList } from './CampaignTagBadge'

// =============================================================================
// CONSTANTS
// =============================================================================

const STATUS_LABELS = {
  [CampaignStatus.COMPLETED]: 'Concluido',
  [CampaignStatus.SENDING]: 'Enviando',
  [CampaignStatus.FAILED]: 'Falhou',
  [CampaignStatus.DRAFT]: 'Rascunho',
  [CampaignStatus.PAUSED]: 'Pausado',
  [CampaignStatus.SCHEDULED]: 'Agendado',
  [CampaignStatus.CANCELLED]: 'Cancelado',
} as const

const getCampaignBadgeStatus = (status: CampaignStatus) => {
  const map: Record<CampaignStatus, 'completed' | 'sending' | 'failed' | 'draft' | 'paused' | 'scheduled' | 'default'> = {
    [CampaignStatus.COMPLETED]: 'completed',
    [CampaignStatus.SENDING]: 'sending',
    [CampaignStatus.FAILED]: 'failed',
    [CampaignStatus.DRAFT]: 'draft',
    [CampaignStatus.PAUSED]: 'paused',
    [CampaignStatus.SCHEDULED]: 'scheduled',
    [CampaignStatus.CANCELLED]: 'default',
  }
  return map[status] || 'default'
}

const StatusBadge = ({ status }: { status: CampaignStatus }) => (
  <DsStatusBadge
    status={getCampaignBadgeStatus(status)}
    showDot={status === CampaignStatus.SENDING}
  >
    {STATUS_LABELS[status]}
  </DsStatusBadge>
)

// =============================================================================
// CAMPAIGN CARD
// =============================================================================

interface CampaignCardProps {
  campaign: Campaign
  onRowClick: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate?: (id: string) => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onStart?: (id: string) => void
  isPausing?: boolean
  isResuming?: boolean
  isStarting?: boolean
  deletingId?: string
  duplicatingId?: string
}

export const CampaignCard = React.memo(
  function CampaignCard({
    campaign,
    onRowClick,
    onDelete,
    onDuplicate,
    onPause,
    onResume,
    onStart,
    isPausing,
    isResuming,
    isStarting,
    deletingId,
    duplicatingId,
  }: CampaignCardProps) {
    const isDeleting = deletingId === campaign.id
    const isDuplicating = duplicatingId === campaign.id

    // Delivery calculations
    const recipients = campaign.recipients ?? 0
    const delivered = campaign.delivered ?? 0
    const read = campaign.read ?? 0
    const deliveredEffective = Math.max(delivered, read)
    const deliveryPct = recipients > 0 ? (deliveredEffective / Math.max(1, recipients)) * 100 : 0
    const deliveryPctRounded = recipients > 0 ? Math.round((deliveredEffective / Math.max(1, recipients)) * 100) : 0

    return (
      <div
        onClick={() => onRowClick(campaign.id)}
        className="p-4 border border-[var(--ds-border-subtle)] rounded-xl bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)] transition-all cursor-pointer hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]"
      >
        {/* Header: Name, Template, Status, Tags */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--ds-text-primary)] truncate">{campaign.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-[var(--ds-text-muted)] font-mono truncate">{campaign.templateName}</p>
              {campaign.folder && (
                <span className="flex items-center gap-1 text-xs text-[var(--ds-text-muted)]">
                  <FolderIcon size={10} style={{ color: campaign.folder.color }} />
                  <span className="truncate max-w-[80px]">{campaign.folder.name}</span>
                </span>
              )}
            </div>
            {campaign.scheduledAt && campaign.status === CampaignStatus.SCHEDULED && (
              <p className="text-xs text-violet-400 mt-1 flex items-center gap-1">
                <Calendar size={10} />
                {formatDateTimeFull(campaign.scheduledAt)}
              </p>
            )}
            {/* Tags */}
            {campaign.tags && campaign.tags.length > 0 && (
              <div className="mt-1.5">
                <CampaignTagList tags={campaign.tags} maxVisible={2} size="sm" />
              </div>
            )}
          </div>
          <StatusBadge status={campaign.status} />
        </div>

        {/* Progress bar + metrics */}
        <div className="mt-3">
          <Progress
            value={deliveryPct}
            color="brand"
            size="sm"
            showLabel
            labelPosition="right"
            formatLabel={() => `${deliveryPctRounded}%`}
          />
          <div className="mt-2 flex items-center gap-3 text-xs text-[var(--ds-text-muted)]">
            <span className="flex items-center gap-1">
              <Users size={12} />
              {recipients.toLocaleString('pt-BR')} destinatarios
            </span>
            <span>•</span>
            <span>{deliveredEffective.toLocaleString('pt-BR')} entregues</span>
          </div>
        </div>

        {/* Footer: Date + Actions */}
        <div className="mt-3 pt-3 border-t border-[var(--ds-border-subtle)] flex items-center justify-between">
          <span className="text-xs text-[var(--ds-text-muted)] font-mono">
            {formatDateFull(campaign.createdAt)}
          </span>

          <div className="flex items-center gap-1">
            {/* Clone */}
            {onDuplicate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onDuplicate(campaign.id); }}
                    aria-label="Clonar campanha"
                    disabled={isDuplicating}
                  >
                    {isDuplicating ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Clonar</p></TooltipContent>
              </Tooltip>
            )}

            {/* Start scheduled/draft */}
            {(campaign.status === CampaignStatus.SCHEDULED || campaign.status === CampaignStatus.DRAFT) && onStart && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onStart(campaign.id); }}
                    aria-label="Iniciar agora"
                    disabled={isStarting}
                  >
                    <Play size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Iniciar</p></TooltipContent>
              </Tooltip>
            )}

            {/* Pause sending */}
            {campaign.status === CampaignStatus.SENDING && onPause && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onPause(campaign.id); }}
                    aria-label="Pausar"
                    disabled={isPausing}
                  >
                    <Pause size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Pausar</p></TooltipContent>
              </Tooltip>
            )}

            {/* Resume paused */}
            {campaign.status === CampaignStatus.PAUSED && onResume && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onResume(campaign.id); }}
                    aria-label="Retomar"
                    disabled={isResuming}
                  >
                    <Play size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Retomar</p></TooltipContent>
              </Tooltip>
            )}

            {/* Delete */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost-destructive"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); onDelete(campaign.id); }}
                  aria-label="Excluir"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Excluir</p></TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    )
  },
  // Custom comparison - retorna boolean explicitamente
  (prev, next): boolean => {
    // Comparação shallow de tags (evita JSON.stringify)
    const prevTags = prev.campaign.tags || []
    const nextTags = next.campaign.tags || []
    const tagsEqual = prevTags.length === nextTags.length &&
      prevTags.every((t, i) => t.id === nextTags[i]?.id)

    return (
      prev.campaign.id === next.campaign.id &&
      prev.campaign.status === next.campaign.status &&
      prev.campaign.name === next.campaign.name &&
      prev.campaign.recipients === next.campaign.recipients &&
      prev.campaign.delivered === next.campaign.delivered &&
      prev.campaign.read === next.campaign.read &&
      prev.campaign.folderId === next.campaign.folderId &&
      prev.campaign.folder?.name === next.campaign.folder?.name &&
      prev.campaign.folder?.color === next.campaign.folder?.color &&
      tagsEqual &&
      prev.deletingId === next.deletingId &&
      prev.duplicatingId === next.duplicatingId &&
      prev.isPausing === next.isPausing &&
      prev.isResuming === next.isResuming &&
      prev.isStarting === next.isStarting
    )
  }
)

// =============================================================================
// CAMPAIGN CARD LIST
// =============================================================================

interface CampaignCardListProps {
  campaigns: Campaign[]
  isLoading: boolean
  searchTerm: string
  filter: string
  onRowClick: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate?: (id: string) => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onStart?: (id: string) => void
  isPausing?: boolean
  isResuming?: boolean
  isStarting?: boolean
  deletingId?: string
  duplicatingId?: string
}

export const CampaignCardList = React.memo(function CampaignCardList({
  campaigns,
  isLoading,
  searchTerm,
  filter,
  onRowClick,
  onDelete,
  onDuplicate,
  onPause,
  onResume,
  onStart,
  isPausing,
  isResuming,
  isStarting,
  deletingId,
  duplicatingId,
}: CampaignCardListProps) {
  if (isLoading) {
    return (
      <div className="py-12 text-center text-[var(--ds-text-muted)]">
        Carregando campanhas...
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center mx-auto mb-3">
          <Users size={24} className="text-[var(--ds-text-muted)]" />
        </div>
        <p className="text-[var(--ds-text-secondary)] font-medium">Nenhuma campanha encontrada</p>
        <p className="text-[var(--ds-text-muted)] text-sm mt-1">
          {searchTerm || filter !== 'All'
            ? 'Tente ajustar os filtros ou buscar por outro termo'
            : 'Crie sua primeira campanha para comecar'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          onRowClick={onRowClick}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onPause={onPause}
          onResume={onResume}
          onStart={onStart}
          isPausing={isPausing}
          isResuming={isResuming}
          isStarting={isStarting}
          deletingId={deletingId}
          duplicatingId={duplicatingId}
        />
      ))}
    </div>
  )
})
