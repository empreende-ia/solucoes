import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from '@/lib/navigation';
import { toast } from 'sonner';
import { campaignService } from '../services';
import { useCampaignRealtime } from './useCampaignRealtime';
import { Campaign, CampaignStatus, MessageStatus, Message } from '../types';
import { getPollingInterval, isLargeCampaign } from '@/lib/constants';
import {
  mergeCampaignCountersMonotonic,
  mergeMessageStatsMonotonic,
  filterMessages,
  calculateRealStats,
} from '@/lib/business/campaign';

const isDev = process.env.NODE_ENV === 'development';

export const useCampaignDetailsController = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isTemp = Boolean(id && id.startsWith('temp_'))
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<MessageStatus | null>(null);
  const [includeReadInDelivered, setIncludeReadInDelivered] = useState(false);
  const [extraMessages, setExtraMessages] = useState<Message[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResendingSkipped, setIsResendingSkipped] = useState(false);
  const [isCancelingSchedule, setIsCancelingSchedule] = useState(false);
  const [isCancelingSend, setIsCancelingSend] = useState(false);

  // Local type alias for service response (extends business module type)
  type ServiceMessagesResponse = Awaited<ReturnType<(typeof campaignService)['getMessages']>>

  // Refs para merge monotônico (evita regressão visual quando broadcast chega antes do DB).
  const lastCampaignRef = useRef<Campaign | undefined>(undefined)
  const lastMessagesRef = useRef<ServiceMessagesResponse | undefined>(undefined)
  const loadMoreTokenRef = useRef(0)

  // Warmup polling: nos primeiros 30s após carregar ID real, fazemos polling
  // rápido para capturar a transição DRAFT → SENDING (Realtime não conecta para DRAFT)
  const warmupStartRef = useRef<Record<string, number>>({})
  const WARMUP_DURATION_MS = 30_000 // 30 segundos
  const WARMUP_INTERVAL_MS = 3_000 // polling a cada 3s durante warmup

  // Registra início do warmup quando ID muda para um ID real
  useEffect(() => {
    if (id && !id.startsWith('temp_') && !warmupStartRef.current[id]) {
      warmupStartRef.current[id] = Date.now()
    }
  }, [id])

  // Fetch campaign data (com warmup polling via função)
  const campaignQuery = useQuery<Campaign | undefined>({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const result = await campaignService.getById(id!)
      return result
    },
    enabled: !!id && !id.startsWith('temp_'),
    staleTime: 5000,
    // Warmup polling usando FUNÇÃO: TanStack Query chama esta função após cada fetch
    // para determinar o próximo intervalo. Muito mais confiável que valor estático.
    refetchInterval: (query) => {
      const campaign = query.state.data
      const campaignId = id

      // Não faz polling se não tem ID real
      if (!campaignId || campaignId.startsWith('temp_')) {
        return false
      }

      // Verifica se está no período de warmup (30s desde que carregou este ID)
      const warmupStart = warmupStartRef.current[campaignId]
      if (!warmupStart) {
        return false
      }

      const elapsed = Date.now() - warmupStart
      const inWarmup = elapsed < WARMUP_DURATION_MS

      // Se está em DRAFT e no warmup, faz polling
      // Quando mudar para SENDING/COMPLETED, Realtime assume
      if (inWarmup && campaign?.status === CampaignStatus.DRAFT) {
        return WARMUP_INTERVAL_MS
      }

      // Fora do warmup ou não é DRAFT - para o polling
      return false
    },
    select: (fresh) => {
      const merged = mergeCampaignCountersMonotonic(lastCampaignRef.current, fresh)
      lastCampaignRef.current = merged
      return merged
    },
  });

  // Para campanhas temporárias (otimistas), usamos cache local do React Query.
  // Isso evita a UX ruim de “Carregando...” enquanto o backend faz pré-check/dispatch.
  const cachedTempCampaign = useMemo(() => {
    if (!isTemp || !id) return undefined
    return queryClient.getQueryData<Campaign>(['campaign', id])
  }, [isTemp, id, queryClient])

  const campaign = (isTemp ? cachedTempCampaign : (campaignQuery.data as Campaign | undefined))

  // Real-time updates via Supabase Realtime with smart debounce
  const { isConnected: isRealtimeConnected, shouldShowRefreshButton, telemetry } = useCampaignRealtime({
    campaignId: (!isTemp ? id : undefined),
    status: campaign?.status,
    recipients: campaign?.recipients || 0,
    completedAt: campaign?.completedAt ?? undefined,
  });

  // Polling logic:
  // - Connected via Realtime: 60s backup polling
  // - Disconnected (Realtime caiu): 10s fallback polling
  // - Large campaigns (>= 10k): polling only
  const isActiveCampaign = campaign?.status === CampaignStatus.SENDING ||
    campaign?.status === CampaignStatus.SCHEDULED ||
    campaign?.status === CampaignStatus.COMPLETED;

  const isLarge = isLargeCampaign(campaign?.recipients || 0);

  const pollingInterval = useMemo(() => {
    if (!isActiveCampaign) return false as const;
    return getPollingInterval(isRealtimeConnected, isLarge);
  }, [isActiveCampaign, isLarge, isRealtimeConnected]);

  const metricsQuery = useQuery<any | null>({
    queryKey: ['campaignMetrics', id],
    queryFn: () => campaignService.getMetrics(id!),
    enabled: !!id && !id.startsWith('temp_'),
    staleTime: 5000,
    refetchInterval: pollingInterval,
  })

  // A API suporta até 100 por página. Para campanhas pequenas isso evita a sensação de
  // "sumiu gente" (ex.: total 54 mas a tabela só mostra 50).
  const MESSAGES_PAGE_LIMIT = 100

  // Reset de paginação quando muda a campanha ou o filtro.
  useEffect(() => {
    loadMoreTokenRef.current += 1
    setExtraMessages([])
    setNextOffset(MESSAGES_PAGE_LIMIT)
    setIsLoadingMore(false)
  }, [id, filterStatus])

  // Se sair do filtro "Entregues", desliga o modo cumulativo.
  useEffect(() => {
    if (filterStatus !== MessageStatus.DELIVERED && includeReadInDelivered) {
      setIncludeReadInDelivered(false)
    }
  }, [filterStatus, includeReadInDelivered])

  // Fetch messages with optional polling
  const messagesQuery = useQuery<ServiceMessagesResponse>({
    queryKey: ['campaignMessages', id, filterStatus, includeReadInDelivered],
    queryFn: () => campaignService.getMessages(id!, {
      status: filterStatus || undefined,
      includeRead: filterStatus === MessageStatus.DELIVERED ? includeReadInDelivered : undefined,
      limit: MESSAGES_PAGE_LIMIT,
      offset: 0,
    }),
    enabled: !!id && !id.startsWith('temp_'),
    staleTime: 5000,
    // Backup polling only while connected and active
    refetchInterval: pollingInterval,
    select: (fresh) => {
      const merged = mergeMessageStatsMonotonic(lastMessagesRef.current, fresh)
      // merged is always defined when fresh is defined (select only called with valid data)
      const result = merged ?? fresh
      lastMessagesRef.current = result
      return result
    },
  });

  const cachedTempMessages = useMemo(() => {
    if (!isTemp || !id) return undefined
    return queryClient.getQueryData<ServiceMessagesResponse>(['campaignMessages', id, filterStatus, includeReadInDelivered])
  }, [isTemp, id, filterStatus, includeReadInDelivered, queryClient])

  const messagesData = (isTemp ? cachedTempMessages : messagesQuery.data)

  const activeCampaign = campaignQuery.data as Campaign | undefined;

  // Messages (página 0) + páginas extras carregadas via "Carregar mais".
  const baseMessages: Message[] = useMemo(() => {
    const data = messagesData;
    if (!data) return [];
    return data.messages || [];
  }, [messagesData]);

  const allLoadedMessages: Message[] = useMemo(() => {
    if (extraMessages.length === 0) return baseMessages

    const seen = new Set<string>()
    const merged: Message[] = []

    for (const msg of baseMessages) {
      if (!msg?.id) continue
      if (seen.has(msg.id)) continue
      seen.add(msg.id)
      merged.push(msg)
    }

    for (const msg of extraMessages) {
      if (!msg?.id) continue
      if (seen.has(msg.id)) continue
      seen.add(msg.id)
      merged.push(msg)
    }

    return merged
  }, [baseMessages, extraMessages]);

  const messageStats = useMemo(() => {
    const data = messagesData;
    return data?.stats || null;
  }, [messagesData]);

  const totalMessages = useMemo(() => {
    const total = Number(messagesData?.pagination?.total ?? messageStats?.total ?? 0)
    return total > 0 ? total : allLoadedMessages.length
  }, [allLoadedMessages.length, messageStats?.total, messagesData?.pagination?.total])

  const canLoadMore = useMemo(() => {
    if (!id || id.startsWith('temp_')) return false
    if (messagesQuery.isLoading) return false
    return allLoadedMessages.length < totalMessages
  }, [allLoadedMessages.length, id, messagesQuery.isLoading, totalMessages])

  const handleLoadMore = async () => {
    if (!id || id.startsWith('temp_')) return
    if (isLoadingMore) return
    if (!canLoadMore) return

    const token = loadMoreTokenRef.current
    const offset = nextOffset

    setIsLoadingMore(true)
    try {
      const res = await campaignService.getMessages(id, {
        status: filterStatus || undefined,
        includeRead: filterStatus === MessageStatus.DELIVERED ? includeReadInDelivered : undefined,
        limit: MESSAGES_PAGE_LIMIT,
        offset,
      })

      // Se o usuário trocou campanha/filtro enquanto carregava, ignora.
      if (loadMoreTokenRef.current !== token) return

      const newMsgs = res?.messages || []
      setExtraMessages(prev => {
        if (!newMsgs.length) return prev

        const seen = new Set(prev.map(m => m.id))
        const appended = newMsgs.filter(m => m?.id && !seen.has(m.id))
        return appended.length ? [...prev, ...appended] : prev
      })

      setNextOffset(offset + MESSAGES_PAGE_LIMIT)
    } finally {
      if (loadMoreTokenRef.current === token) {
        setIsLoadingMore(false)
      }
    }
  }

  // Manual refresh function
  const refetch = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        campaignQuery.refetch(),
        messagesQuery.refetch(),
      ]);
      toast.success('Dados atualizados');
    } catch {
      toast.error('Erro ao atualizar dados');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Pause mutation - optimized: update specific cache, invalidate only active list queries
  const pauseMutation = useMutation({
    mutationFn: () => campaignService.pause(id!),
    onSuccess: (updatedCampaign) => {
      toast.success('Campanha pausada com sucesso');
      // Update specific campaign cache directly
      if (updatedCampaign) {
        queryClient.setQueryData(['campaign', id], updatedCampaign);
        lastCampaignRef.current = updatedCampaign;
      }
      // Only invalidate active list queries (not all pages)
      queryClient.invalidateQueries({ queryKey: ['campaigns'], refetchType: 'active' });
    },
    onError: () => {
      toast.error('Erro ao pausar campanha');
    }
  });

  // Resume mutation - optimized: update specific cache, invalidate only active list queries
  const resumeMutation = useMutation({
    mutationFn: () => campaignService.resume(id!),
    onSuccess: (updatedCampaign) => {
      toast.success('Campanha retomada com sucesso');
      // Update specific campaign cache directly
      if (updatedCampaign) {
        queryClient.setQueryData(['campaign', id], updatedCampaign);
        lastCampaignRef.current = updatedCampaign;
      }
      // Only invalidate active list queries (not all pages)
      queryClient.invalidateQueries({ queryKey: ['campaigns'], refetchType: 'active' });
    },
    onError: () => {
      toast.error('Erro ao retomar campanha');
    }
  });

  // Start mutation (for scheduled campaigns) - optimized
  const startMutation = useMutation({
    mutationFn: () => campaignService.start(id!),
    onSuccess: (updatedCampaign) => {
      toast.success('Campanha iniciada com sucesso');
      // Update specific campaign cache directly
      if (updatedCampaign) {
        queryClient.setQueryData(['campaign', id], updatedCampaign);
        lastCampaignRef.current = updatedCampaign;
      }
      // Only invalidate active list queries (not all pages)
      queryClient.invalidateQueries({ queryKey: ['campaigns'], refetchType: 'active' });
    },
    onError: () => {
      toast.error('Erro ao iniciar campanha');
    }
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: () => campaignService.cancelSchedule(id!),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success('Agendamento cancelado. A campanha voltou para Rascunho.');
        // Invalidate this campaign and active list queries only
        queryClient.invalidateQueries({ queryKey: ['campaign', id] });
        queryClient.invalidateQueries({ queryKey: ['campaigns'], refetchType: 'active' });
      } else {
        toast.error(result.error || 'Falha ao cancelar agendamento');
      }
    },
    onError: () => {
      toast.error('Falha ao cancelar agendamento');
    }
  })

  const cancelSendMutation = useMutation({
    mutationFn: () => campaignService.cancel(id!),
    onSuccess: () => {
      toast.success('Envio cancelado');
      // Invalidate this campaign and its messages
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaignMessages', id] });
      // Only active list queries
      queryClient.invalidateQueries({ queryKey: ['campaigns'], refetchType: 'active' });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Falha ao cancelar envio');
    }
  })

  const resendSkippedMutation = useMutation({
    mutationFn: () => campaignService.resendSkipped(id!),
    onSuccess: async (result) => {
      toast.success(result.message || 'Ignorados reenfileirados')
      // Invalidate this campaign and its messages in parallel
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
        queryClient.invalidateQueries({ queryKey: ['campaignMessages', id] }),
        // Only active list queries
        queryClient.invalidateQueries({ queryKey: ['campaigns'], refetchType: 'active' }),
      ])
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao reenviar ignorados')
    }
  })

  // Use extracted pure function for filtering
  const filteredMessages = useMemo(() => {
    return filterMessages(allLoadedMessages, { searchTerm });
  }, [allLoadedMessages, searchTerm]);

  // Calculate real stats from messages (fallback if campaign stats not available)
  // Uses extracted pure function
  const realStats = useMemo(() => {
    return calculateRealStats(allLoadedMessages);
  }, [allLoadedMessages]);

  // Actions
  const handlePause = () => {
    if (activeCampaign?.status === CampaignStatus.SENDING) {
      pauseMutation.mutate();
    }
  };

  const handleResume = () => {
    if (activeCampaign?.status === CampaignStatus.PAUSED) {
      resumeMutation.mutate();
    }
  };

  const handleStart = () => {
    if (activeCampaign?.status === CampaignStatus.SCHEDULED || activeCampaign?.status === CampaignStatus.DRAFT) {
      startMutation.mutate();
    }
  };

  const handleResendSkipped = async () => {
    if (!id) return
    setIsResendingSkipped(true)
    try {
      await resendSkippedMutation.mutateAsync()
    } finally {
      setIsResendingSkipped(false)
    }
  }

  const handleCancelSchedule = async () => {
    if (!id) return
    setIsCancelingSchedule(true)
    try {
      await cancelScheduleMutation.mutateAsync()
    } finally {
      setIsCancelingSchedule(false)
    }
  }

  const handleCancelSend = async () => {
    if (!id) return
    if (![CampaignStatus.SENDING, CampaignStatus.PAUSED].includes(activeCampaign?.status as any)) return
    setIsCancelingSend(true)
    try {
      await cancelSendMutation.mutateAsync()
    } finally {
      setIsCancelingSend(false)
    }
  }

  // Can perform actions?
  const canPause = activeCampaign?.status === CampaignStatus.SENDING;
  const canResume = activeCampaign?.status === CampaignStatus.PAUSED;
  const canStart = activeCampaign?.status === CampaignStatus.SCHEDULED || activeCampaign?.status === CampaignStatus.DRAFT;
  const canCancelSchedule = activeCampaign?.status === CampaignStatus.SCHEDULED;
  const canCancelSend = activeCampaign?.status === CampaignStatus.SENDING || activeCampaign?.status === CampaignStatus.PAUSED;

  return {
    campaign: activeCampaign,
    messages: filteredMessages,
    isLoading: isTemp ? false : (campaignQuery.isLoading || messagesQuery.isLoading),
    metrics: metricsQuery.data,
    searchTerm,
    setSearchTerm,
    navigate,
    realStats,
    messageStats,
    onLoadMore: handleLoadMore,
    canLoadMore,
    isLoadingMore,
    includeReadInDelivered,
    setIncludeReadInDelivered,
    // Realtime status
    isRealtimeConnected,
    shouldShowRefreshButton,
    telemetry,
    isRefreshing,
    refetch,
    // Actions
    onPause: handlePause,
    onResume: handleResume,
    onStart: handleStart,
    onCancelSchedule: handleCancelSchedule,
    onCancelSend: handleCancelSend,
    isCancelingSchedule,
    isCancelingSend,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isStarting: startMutation.isPending,
    canCancelSchedule,
    canCancelSend,
    canPause,
    canResume,
    canStart,
    onResendSkipped: handleResendSkipped,
    isResendingSkipped,
    filterStatus,
    setFilterStatus,
  };
};
