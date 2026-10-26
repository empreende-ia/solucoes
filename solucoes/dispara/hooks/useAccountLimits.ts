/**
 * Hook para gerenciar limites da conta Meta WhatsApp
 * 
 * Busca, cacheia e valida limites da conta automaticamente.
 * Usado para prevenir usuários de enviar campanhas que excedam seus limites.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  AccountLimits, 
  CampaignValidation,
  TEST_LIMITS,
  DEBUG_LOW_LIMIT,
  LIMITS_STORAGE_KEY,
  getCachedLimits,
  cacheLimits,
  areLimitsStale,
  validateCampaign,
  TIER_DISPLAY_NAMES,
} from '../lib/meta-limits';

// Query key for React Query
const LIMITS_QUERY_KEY = ['account-limits'];

// Error type for limits fetch failures
export class LimitsFetchError extends Error {
  constructor(
    message: string,
    public code: 'NO_CREDENTIALS' | 'API_ERROR' | 'FETCH_FAILED',
    public details?: unknown
  ) {
    super(message);
    this.name = 'LimitsFetchError';
  }
}

/**
 * Fetches account limits from backend API
 * Backend usa credenciais salvas (Supabase settings / env) — não precisa passar do frontend
 */
async function fetchLimitsFromAPI(): Promise<AccountLimits> {
  // Chama a API sem credenciais no body (backend usa credenciais salvas)
  const response = await fetch('/api/account/limits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // Body vazio: backend usa credenciais salvas
  });
  
  const data = await response.json();
  
  // Check for error response from backend
  if (!response.ok || data.error) {
    throw new LimitsFetchError(
      data.message || 'Falha ao buscar limites da Meta',
      data.error || 'API_ERROR',
      data.details
    );
  }
  
  // Validate that we got real limits, not fallback
  if (!data.messagingTier || data.maxUniqueUsersPerDay === undefined) {
    throw new LimitsFetchError(
      'Resposta inválida da API da Meta',
      'FETCH_FAILED',
      data
    );
  }
  
  // Cache the result
  cacheLimits(data);
  
  return data;
}

/**
 * Main hook for account limits
 * NO FALLBACKS - returns error state if limits cannot be fetched
 */
export function useAccountLimits() {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: LIMITS_QUERY_KEY,
    queryFn: async () => {
      // Check cache first (only if not stale)
      const cached = getCachedLimits();
      
      if (cached && !areLimitsStale(cached)) {
        return cached;
      }
      
      // Fetch fresh data - will throw if fails
      return fetchLimitsFromAPI();
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    // Initialize with cached data (if valid)
    initialData: () => {
      const cached = getCachedLimits();
      return cached && !areLimitsStale(cached) ? cached : undefined;
    },
    // Retry logic
    retry: 2,
    retryDelay: 1000,
  });
  
  /**
   * Force refresh limits from API
   */
  const refreshLimits = () => {
    localStorage.removeItem(LIMITS_STORAGE_KEY);
    queryClient.invalidateQueries({ queryKey: LIMITS_QUERY_KEY });
  };
  
  /**
   * Validate a campaign against current limits
   * Returns blocked validation if limits not available
   */
  const validate = (contactCount: number): CampaignValidation => {
    // 🧪 DEBUG MODE: Use test limits with very low threshold
    if (DEBUG_LOW_LIMIT) {
      return validateCampaign(contactCount, TEST_LIMITS);
    }
    
    // If limits not loaded or error, block sending
    if (!query.data) {
      return {
        canSend: false,
        blockedReason: query.isError 
          ? `Erro ao verificar limites: ${(query.error as LimitsFetchError)?.message || 'Erro desconhecido'}`
          : 'Carregando limites da conta...',
        warnings: [],
        currentTier: 'TIER_250',
        currentLimit: 0,
        requestedCount: contactCount,
        remainingToday: 0,
        estimatedDuration: '-',
      };
    }
    
    return validateCampaign(contactCount, query.data);
  };
  
  /**
   * Get human-readable tier name
   */
  const getTierDisplayName = (): string => {
    const tier = query.data?.messagingTier || 'TIER_250';
    return TIER_DISPLAY_NAMES[tier] || tier;
  };
  
  // Error message for UI
  const errorMessage = query.isError 
    ? (query.error as LimitsFetchError)?.message || 'Erro ao buscar limites'
    : null;

  return {
    // Data - NO FALLBACK, can be null
    limits: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    errorMessage,
    
    // State flags
    hasLimits: !!query.data,
    canCreateCampaign: !!query.data && !query.isError,
    
    // Actions
    refreshLimits,
    validate,
    getTierDisplayName,
    
    // Computed - only available if limits loaded
    tierName: query.data ? getTierDisplayName() : null,
    maxUsers: query.data?.maxUniqueUsersPerDay ?? null,
    throughput: query.data?.maxMessagesPerSecond ?? null,
    quality: query.data?.qualityScore ?? null,
  };
}

/**
 * Simple hook just for validation (lighter weight)
 */
export function useCampaignValidation(contactCount: number) {
  const { limits, isLoading } = useAccountLimits();
  
  if (isLoading) {
    return {
      isValidating: true,
      validation: null,
    };
  }
  
  if (!limits) {
    return {
      isValidating: false,
      validation: null,
    };
  }
  
  return {
    isValidating: false,
    validation: validateCampaign(contactCount, limits),
  };
}
