'use client'

import React from 'react';
import { Search, RefreshCw, Copy, Trash2, Calendar, Play, Pause, Loader2 } from 'lucide-react';
import { Campaign, CampaignStatus } from '../../../types'
import { formatDateFull, formatDateTimeFull } from '@/lib/date-formatter';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Container } from '@/components/ui/container';
import { StatusBadge as DsStatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { CampaignCardList } from './CampaignCard';
import { CampaignFolderFilter } from './CampaignFolderFilter';
import { CampaignTagFilter } from './CampaignTagFilter';
import { MoveToFolderButton } from './MoveToFolderButton';
import { useIsMobile } from '@/hooks/useMediaQuery';

// =============================================================================
// CONSTANTS
// =============================================================================

const STATUS_LABELS = {
  [CampaignStatus.COMPLETED]: 'Concluído',
  [CampaignStatus.SENDING]: 'Enviando',
  [CampaignStatus.FAILED]: 'Falhou',
  [CampaignStatus.DRAFT]: 'Rascunho',
  [CampaignStatus.PAUSED]: 'Pausado',
  [CampaignStatus.SCHEDULED]: 'Agendado',
  [CampaignStatus.CANCELLED]: 'Cancelado',
} as const;

const getCampaignBadgeStatus = (status: CampaignStatus) => {
  const map: Record<CampaignStatus, 'completed' | 'sending' | 'failed' | 'draft' | 'paused' | 'scheduled' | 'default'> = {
    [CampaignStatus.COMPLETED]: 'completed',
    [CampaignStatus.SENDING]: 'sending',
    [CampaignStatus.FAILED]: 'failed',
    [CampaignStatus.DRAFT]: 'draft',
    [CampaignStatus.PAUSED]: 'paused',
    [CampaignStatus.SCHEDULED]: 'scheduled',
    [CampaignStatus.CANCELLED]: 'default',
  };
  return map[status] || 'default';
};

// =============================================================================
// TYPES
// =============================================================================

interface CampaignListViewProps {
  campaigns: Campaign[];
  isLoading: boolean;
  filter: string;
  searchTerm: string;
  onFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  currentPage: number;
  totalPages: number;
  totalFiltered: number;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRowClick: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onStart?: (id: string) => void;
  onMoveToFolder?: (campaignId: string, folderId: string | null) => void;
  isPausing?: boolean;
  isResuming?: boolean;
  isStarting?: boolean;
  deletingId?: string;
  duplicatingId?: string;
  movingToFolderId?: string;
  // Organization filters
  folderFilter: string | null;
  tagFilter: string[];
  onFolderFilterChange: (folderId: string | null) => void;
  onTagFilterChange: (tagIds: string[]) => void;
  onManageFolders: () => void;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

const StatusBadge = ({ status }: { status: CampaignStatus }) => (
  <DsStatusBadge
    status={getCampaignBadgeStatus(status)}
    showDot={status === CampaignStatus.SENDING}
  >
    {STATUS_LABELS[status]}
  </DsStatusBadge>
);

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function calcSendDuration(campaign: Campaign): string {
  const startIso = campaign.firstDispatchAt || campaign.startedAt
  if (!startIso || !campaign.lastSentAt) return '—'
  const start = Date.parse(startIso)
  const end = Date.parse(campaign.lastSentAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—'
  return formatDuration(end - start)
}

// =============================================================================
// TABLE ROW (Memoized)
// =============================================================================

interface CampaignTableRowProps {
  campaign: Campaign;
  onRowClick: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onStart?: (id: string) => void;
  onMoveToFolder?: (campaignId: string, folderId: string | null) => void;
  isPausing?: boolean;
  isResuming?: boolean;
  isStarting?: boolean;
  deletingId?: string;
  duplicatingId?: string;
  movingToFolderId?: string;
}

const CampaignTableRow = React.memo(
  function CampaignTableRow({
    campaign,
    onRowClick,
    onDelete,
    onDuplicate,
    onPause,
    onResume,
    onStart,
    onMoveToFolder,
    isPausing,
    isResuming,
    isStarting,
    deletingId,
    duplicatingId,
    movingToFolderId,
  }: CampaignTableRowProps) {
    const isDeleting = deletingId === campaign.id;
    const isDuplicating = duplicatingId === campaign.id;
    const isMoving = movingToFolderId === campaign.id;

    const recipients = campaign.recipients ?? 0;
    const delivered = campaign.delivered ?? 0;
    const read = campaign.read ?? 0;
    const deliveredEffective = Math.max(delivered, read);
    const deliveryPct = recipients > 0 ? (deliveredEffective / Math.max(1, recipients)) * 100 : 0;
    const deliveryPctRounded = recipients > 0 ? Math.round((deliveredEffective / Math.max(1, recipients)) * 100) : 0;

    return (
      <tr
        onClick={() => onRowClick(campaign.id)}
        className="hover:bg-[var(--ds-bg-hover)] transition-all duration-200 group cursor-pointer hover:shadow-[0_0_20px_rgba(16,185,129,0.06)]"
      >
        <td className="px-6 py-4">
          <p className="font-medium text-[var(--ds-text-primary)] group-hover:text-primary-400 transition-colors">{campaign.name}</p>
          <p className="text-xs text-[var(--ds-text-muted)] mt-1 font-mono">{campaign.templateName}</p>
          {campaign.scheduledAt && campaign.status === CampaignStatus.SCHEDULED && (
            <p className="text-xs text-violet-400 mt-1 flex items-center gap-1">
              <Calendar size={10} />
              {formatDateTimeFull(campaign.scheduledAt)}
            </p>
          )}
        </td>
        <td className="px-6 py-4">
          <StatusBadge status={campaign.status} />
        </td>
        <td className="px-6 py-4 text-[var(--ds-text-secondary)] font-mono">
          {recipients.toLocaleString('pt-BR')}
        </td>
        <td className="px-6 py-4">
          <div className="w-32">
            <Progress
              value={deliveryPct}
              color="brand"
              size="sm"
              showLabel
              labelPosition="right"
              formatLabel={() => `${deliveryPctRounded}%`}
            />
          </div>
        </td>
        <td className="px-6 py-4 text-[var(--ds-text-secondary)] font-mono">
          <span
            className="text-xs"
            title={(campaign.firstDispatchAt || campaign.startedAt) && campaign.lastSentAt
              ? `De ${formatDateTimeFull(campaign.firstDispatchAt || campaign.startedAt!)} até ${formatDateTimeFull(campaign.lastSentAt)}`
              : 'Duração do disparo'}
          >
            {calcSendDuration(campaign)}
          </span>
        </td>
        <td className="px-6 py-4 text-[var(--ds-text-muted)] font-mono text-xs">
          {formatDateFull(campaign.createdAt)}
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            {/* Move to folder */}
            {onMoveToFolder && (
              <MoveToFolderButton
                campaignId={campaign.id}
                currentFolderId={campaign.folderId}
                onMove={onMoveToFolder}
                isMoving={isMoving}
              />
            )}

            {onDuplicate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onDuplicate(campaign.id); }}
                    disabled={isDuplicating}
                  >
                    {isDuplicating ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Clonar</p></TooltipContent>
              </Tooltip>
            )}

            {(campaign.status === CampaignStatus.SCHEDULED || campaign.status === CampaignStatus.DRAFT) && onStart && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onStart(campaign.id); }}
                    disabled={isStarting}
                  >
                    <Play size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Iniciar</p></TooltipContent>
              </Tooltip>
            )}

            {campaign.status === CampaignStatus.SENDING && onPause && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onPause(campaign.id); }}
                    disabled={isPausing}
                  >
                    <Pause size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Pausar</p></TooltipContent>
              </Tooltip>
            )}

            {campaign.status === CampaignStatus.PAUSED && onResume && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onResume(campaign.id); }}
                    disabled={isResuming}
                  >
                    <Play size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Retomar</p></TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost-destructive"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); onDelete(campaign.id); }}
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Excluir</p></TooltipContent>
            </Tooltip>
          </div>
        </td>
      </tr>
    );
  },
  (prev, next) => (
    prev.campaign.id === next.campaign.id &&
    prev.campaign.status === next.campaign.status &&
    prev.campaign.name === next.campaign.name &&
    prev.campaign.recipients === next.campaign.recipients &&
    prev.campaign.delivered === next.campaign.delivered &&
    prev.campaign.read === next.campaign.read &&
    prev.campaign.sent === next.campaign.sent &&
    prev.campaign.lastSentAt === next.campaign.lastSentAt &&
    prev.campaign.folderId === next.campaign.folderId &&
    prev.deletingId === next.deletingId &&
    prev.duplicatingId === next.duplicatingId &&
    prev.movingToFolderId === next.movingToFolderId &&
    prev.isPausing === next.isPausing &&
    prev.isResuming === next.isResuming &&
    prev.isStarting === next.isStarting
  )
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CampaignListView: React.FC<CampaignListViewProps> = ({
  campaigns,
  isLoading,
  filter,
  searchTerm,
  onFilterChange,
  onSearchChange,
  currentPage,
  totalPages,
  totalFiltered,
  onPageChange,
  onRefresh,
  onDelete,
  onDuplicate,
  onRowClick,
  onPause,
  onResume,
  onStart,
  onMoveToFolder,
  isPausing,
  isResuming,
  isStarting,
  deletingId,
  duplicatingId,
  movingToFolderId,
  folderFilter,
  tagFilter,
  onFolderFilterChange,
  onTagFilterChange,
  onManageFolders,
}) => {
  const isMobile = useIsMobile();

  return (
    <Page>
      <PageHeader>
        <PageTitle>Campanhas</PageTitle>
        <PageDescription>Gerencie e acompanhe seus disparos de mensagens</PageDescription>
      </PageHeader>

      {/* Filters Bar */}
      <Container variant="glass" padding="md" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-20">
        {/* Search */}
        <div className="relative w-full sm:w-96 group">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] group-focus-within:text-primary-500 transition-colors" />
          <input
            type="text"
            placeholder="Buscar campanhas..."
            className="w-full bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-full py-2.5 pl-11 pr-4 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 text-sm font-medium transition-all text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)] outline-none"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={onRefresh}>
                <RefreshCw size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Atualizar</p></TooltipContent>
          </Tooltip>

          {/* Status Filter */}
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="px-4 py-2.5 text-sm font-medium bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg border border-[var(--ds-border-default)] transition-colors outline-none cursor-pointer appearance-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
          >
            <option value="All">Todos os Status</option>
            <option value={CampaignStatus.DRAFT}>Rascunho</option>
            <option value={CampaignStatus.SENDING}>Enviando</option>
            <option value={CampaignStatus.COMPLETED}>Concluído</option>
            <option value={CampaignStatus.PAUSED}>Pausado</option>
            <option value={CampaignStatus.SCHEDULED}>Agendado</option>
            <option value={CampaignStatus.FAILED}>Falhou</option>
            <option value={CampaignStatus.CANCELLED}>Cancelado</option>
          </select>

          {/* Folder Filter (Dropdown) */}
          <CampaignFolderFilter
            selectedFolderId={folderFilter}
            onChange={onFolderFilterChange}
            onManage={onManageFolders}
          />

          {/* Tag Filter */}
          <CampaignTagFilter
            selectedTagIds={tagFilter}
            onChange={onTagFilterChange}
          />
        </div>
      </Container>

      {/* Table (Desktop) / Cards (Mobile) */}
      {isMobile ? (
        <CampaignCardList
          campaigns={campaigns}
          isLoading={isLoading}
          searchTerm={searchTerm}
          filter={filter}
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
      ) : (
        <div className="ds-table-wrapper">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--ds-bg-surface)]/30">
                  <th className="px-6 py-5 text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest">Nome</th>
                  <th className="px-6 py-5 text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest">Status</th>
                  <th className="px-6 py-5 text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest">Destinatários</th>
                  <th className="px-6 py-5 text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest">Entrega</th>
                  <th className="px-6 py-5 text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest">Envio</th>
                  <th className="px-6 py-5 text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest">Criado em</th>
                  <th className="px-6 py-5 text-[11px] font-extrabold text-[var(--ds-text-muted)] uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ds-border-subtle)]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[var(--ds-text-muted)]">
                      Carregando campanhas...
                    </td>
                  </tr>
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center">
                          <Search size={24} className="text-[var(--ds-text-muted)]" />
                        </div>
                        <div>
                          <p className="text-[var(--ds-text-secondary)] font-medium">Nenhuma campanha encontrada</p>
                          <p className="text-[var(--ds-text-muted)] text-sm mt-1">
                            {searchTerm || filter !== 'All'
                              ? 'Tente ajustar os filtros ou buscar por outro termo'
                              : 'Crie sua primeira campanha para comecar'}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <CampaignTableRow
                      key={campaign.id}
                      campaign={campaign}
                      onRowClick={onRowClick}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                      onPause={onPause}
                      onResume={onResume}
                      onStart={onStart}
                      onMoveToFolder={onMoveToFolder}
                      isPausing={isPausing}
                      isResuming={isResuming}
                      isStarting={isStarting}
                      deletingId={deletingId}
                      duplicatingId={duplicatingId}
                      movingToFolderId={movingToFolderId}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Container variant="glass" padding="md" className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm text-[var(--ds-text-muted)]">
            Pagina {currentPage} de {totalPages} • {totalFiltered} campanha(s)
          </span>
          <nav className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              &lt;
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => onPageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              &gt;
            </Button>
          </nav>
        </Container>
      )}
    </Page>
  );
};
