import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { campaignService, type CampaignListResult } from '../services/campaignService';
import { Campaign, CampaignStatus } from '../types';
import { useRealtimeQuery } from './useRealtimeQuery';
import { PAGINATION, CACHE, REALTIME } from '@/lib/constants';
import { invalidateCampaigns } from '@/lib/query-invalidation';

type CampaignsQueryData =
  | Campaign[]
  | CampaignListResult
  | undefined;

/** Intervalo do polling da lista enquanto há campanha com contadores mudando. */
export const CAMPAIGNS_LIVE_REFETCH_MS = 30_000;
/** Depois do último envio/conclusão, delivered/read ainda chegam por um tempo. */
export const CAMPAIGNS_LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Polling condicional da lista /campaigns.
 *
 * O realtime de campaigns publica contadores no máximo 1x a cada 2s por campanha (e
 * só o PRIMEIRO update de cada janela — ver a migration de hardening): o último
 * delivered/read de uma rajada pode nunca virar evento. Enquanto houver campanha
 * enviando, ou com envio/conclusão nas últimas 24h, a lista refaz o fetch a cada 30s
 * para convergir; sem campanha ativa, custo zero.
 */
export const getCampaignsListRefetchInterval = (
  data: CampaignsQueryData,
  now: number = Date.now()
): number | false => {
  const list = Array.isArray(data) ? data : data?.data ?? [];
  const isRecent = (at?: string | null) => {
    const time = at ? Date.parse(at) : Number.NaN;
    return Number.isFinite(time) && now - time < CAMPAIGNS_LIVE_WINDOW_MS;
  };
  const live = list.some(
    (campaign) =>
      campaign.status === CampaignStatus.SENDING ||
      isRecent(campaign.lastSentAt) ||
      isRecent(campaign.completedAt)
  );
  return live ? CAMPAIGNS_LIVE_REFETCH_MS : false;
};

const removeCampaignFromCache = (current: CampaignsQueryData, id: string): CampaignsQueryData => {
  if (!current) return current;
  if (Array.isArray(current)) {
    return current.filter(c => c.id !== id);
  }
  if (typeof current === 'object' && Array.isArray(current.data)) {
    const before = current.data.length;
    const nextData = current.data.filter(c => c.id !== id);
    const removed = before !== nextData.length;
    return {
      ...current,
      data: nextData,
      total: removed ? Math.max(0, (current.total || 0) - 1) : current.total,
    };
  }
  return current;
};

// --- Data Hook (React Query + Realtime) ---
export const useCampaignsQuery = (
  params: {
    page: number;
    search: string;
    status: string;
    folderId?: string | null;
    tagIds?: string[];
  },
  initialData?: CampaignListResult
) => {
  const limit = PAGINATION.campaigns;
  const offset = Math.max(0, (params.page - 1) * limit);
  return useRealtimeQuery({
    queryKey: ['campaigns', {
      page: params.page,
      search: params.search,
      status: params.status,
      folderId: params.folderId,
      tagIds: params.tagIds,
    }],
    queryFn: () => campaignService.list({
      limit,
      offset,
      search: params.search,
      status: params.status,
      folderId: params.folderId,
      tagIds: params.tagIds,
    }),
    initialData,
    placeholderData: (previous) => previous,
    staleTime: CACHE.campaigns,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Convergência dos contadores (o realtime de campaigns é throttled): só com a aba visível
    refetchInterval: (query) => getCampaignsListRefetchInterval(query.state.data),
    refetchIntervalInBackground: false,
    // Realtime configuration
    table: 'campaigns',
    events: ['INSERT', 'UPDATE', 'DELETE'],
    debounceMs: REALTIME.debounceDefault,
  });
};

// --- Mutations ---
export const useCampaignMutations = () => {
  const queryClient = useQueryClient();

  // Track which IDs are currently being processed
  const [processingDeleteId, setProcessingDeleteId] = useState<string | undefined>(undefined);
  const [processingDuplicateId, setProcessingDuplicateId] = useState<string | undefined>(undefined);
  const [lastDuplicatedCampaignId, setLastDuplicatedCampaignId] = useState<string | undefined>(undefined);

  const deleteMutation = useMutation({
    mutationFn: campaignService.delete,
    // Optimistic update: remove immediately from UI
    onMutate: async (id: string) => {
      setProcessingDeleteId(id);
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['campaigns'] });

      // Get the current data
      const previousData = queryClient.getQueriesData<CampaignsQueryData>({ queryKey: ['campaigns'] });

      // Optimistically remove from all cached pages
      queryClient.setQueriesData<CampaignsQueryData>(
        { queryKey: ['campaigns'] },
        (old) => removeCampaignFromCache(old, id)
      );

      // Also remove from dashboard recent campaigns
      queryClient.setQueryData<Campaign[]>(['recentCampaigns'], (old) =>
        old?.filter(c => c.id !== id) ?? []
      );

      return { previousData };
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([key, data]) => {
          queryClient.setQueryData(key as QueryKey, data);
        });
      }
    },
    onSuccess: () => {
      // Server-side cache was invalidated via revalidateTag
      // Force refetch to get fresh data from invalidated cache
      invalidateCampaigns(queryClient);
    },
    onSettled: () => {
      setProcessingDeleteId(undefined);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: campaignService.duplicate,
    onMutate: async (id: string) => {
      setProcessingDuplicateId(id);
      // Evita refetch simultâneo durante a duplicação
      await queryClient.cancelQueries({ queryKey: ['campaigns'] });
      return { id };
    },
    onSuccess: (clonedCampaign) => {
      setLastDuplicatedCampaignId(clonedCampaign?.id);
      // Server-side cache foi invalidado via revalidateTag (quando aplicável)
      invalidateCampaigns(queryClient);
    },
    onSettled: () => {
      setProcessingDuplicateId(undefined);
    },
  });

  const [movingToFolderId, setMovingToFolderId] = useState<string | undefined>(undefined);

  const moveToFolderMutation = useMutation({
    mutationFn: ({ campaignId, folderId }: { campaignId: string; folderId: string | null }) =>
      campaignService.updateCampaignFolder(campaignId, folderId),
    onMutate: async ({ campaignId }) => {
      setMovingToFolderId(campaignId);
      await queryClient.cancelQueries({ queryKey: ['campaigns'] });
    },
    onSuccess: () => {
      invalidateCampaigns(queryClient);
      // Invalida também os folders para atualizar contagens
      queryClient.invalidateQueries({ queryKey: ['campaign-folders'] });
    },
    onSettled: () => {
      setMovingToFolderId(undefined);
    },
  });

  return {
    deleteCampaign: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    deletingId: processingDeleteId,

    duplicateCampaign: duplicateMutation.mutate,
    isDuplicating: duplicateMutation.isPending,
    duplicatingId: processingDuplicateId,

    moveToFolder: moveToFolderMutation.mutate,
    isMovingToFolder: moveToFolderMutation.isPending,
    movingToFolderId,

    lastDuplicatedCampaignId,
    clearLastDuplicatedCampaignId: () => setLastDuplicatedCampaignId(undefined),
  };
};

// --- Controller Hook (Smart) ---
export const useCampaignsController = (initialData?: CampaignListResult) => {
  // UI State
  const [filter, setFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [folderFilter, setFolderFilter] = useState<string | null>(null); // null = todas, 'none' = sem pasta, UUID = pasta específica
  const [tagFilter, setTagFilter] = useState<string[]>([]); // IDs das tags para filtrar

  const { data, isLoading, error, refetch } = useCampaignsQuery(
    {
      page: currentPage,
      search: searchTerm.trim(),
      status: filter,
      folderId: folderFilter,
      tagIds: tagFilter.length > 0 ? tagFilter : undefined,
    },
    initialData
  );

  const campaigns = data?.data || [];
  const totalFiltered = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGINATION.campaigns));
  const {
    deleteCampaign,
    duplicateCampaign,
    moveToFolder,
    isDeleting,
    deletingId,
    isDuplicating,
    duplicatingId,
    isMovingToFolder,
    movingToFolderId,
    lastDuplicatedCampaignId,
    clearLastDuplicatedCampaignId,
  } = useCampaignMutations();

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm, folderFilter, tagFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Handlers - memoizados para evitar re-renders desnecessários
  const handleDelete = useCallback((id: string) => {
    // Deletar diretamente sem confirmação (pode ser desfeito clonando)
    deleteCampaign(id);
  }, [deleteCampaign]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDuplicate = useCallback((id: string) => {
    duplicateCampaign(id);
  }, [duplicateCampaign]);

  const handleMoveToFolder = useCallback((campaignId: string, folderId: string | null) => {
    moveToFolder({ campaignId, folderId });
  }, [moveToFolder]);

  return {
    // Data
    campaigns,
    isLoading: isLoading && !data,
    error,

    // State
    filter,
    searchTerm,
    folderFilter,
    tagFilter,

    // Setters
    setFilter,
    setSearchTerm,
    setFolderFilter,
    setTagFilter,
    currentPage,
    setCurrentPage,
    totalPages,
    totalFiltered,

    // Actions
    onDelete: handleDelete,
    onDuplicate: handleDuplicate,
    onRefresh: handleRefresh,
    onMoveToFolder: handleMoveToFolder,

    // Loading states for specific items
    isDeleting,
    deletingId,
    isDuplicating,
    duplicatingId,
    isMovingToFolder,
    movingToFolderId,

    // Redirect helper (wrapper pode observar isso e navegar)
    lastDuplicatedCampaignId,
    clearLastDuplicatedCampaignId,
  };
};
