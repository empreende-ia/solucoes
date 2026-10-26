/**
 * Meta WhatsApp API - Intelligent Rate Limiting System
 * 
 * Sistema de proteção que impede usuários de enviar campanhas
 * que excedam os limites da conta, com roadmap de evolução.
 * 
 * @see https://developers.facebook.com/docs/whatsapp/messaging-limits
 * @see https://developers.facebook.com/docs/whatsapp/throughput
 */

// ===== TYPES =====

export type MessagingTier =
  | 'TIER_250'      // New accounts: 250 unique users/24h
  | 'TIER_1K'       // Legacy tier (now 2K)
  | 'TIER_2K'       // After scaling path: 2,000
  | 'TIER_10K'      // Auto-scaling: 10,000
  | 'TIER_100K'     // Auto-scaling: 100,000
  | 'TIER_UNLIMITED'; // Full access

export type ThroughputLevel =
  | 'STANDARD'  // 80 mps (default for all Cloud API accounts)
  | 'HIGH';     // 1,000 mps (auto-upgrade when eligible)

export type QualityScore =
  | 'GREEN'     // High quality
  | 'YELLOW'    // Medium quality
  | 'RED'       // Low quality (rate limits may apply)
  | 'UNKNOWN';

export interface AccountLimits {
  // Messaging limits (unique users per 24h rolling window)
  messagingTier: MessagingTier;
  maxUniqueUsersPerDay: number;

  // Throughput (messages per second)
  throughputLevel: ThroughputLevel;
  maxMessagesPerSecond: number;

  // Quality
  qualityScore: QualityScore;

  // Usage tracking
  usedToday?: number;

  // Timestamps
  lastFetched: string;
}

export interface CampaignValidation {
  canSend: boolean;
  blockedReason?: string;
  warnings: string[];
  currentTier: MessagingTier;
  currentLimit: number;
  requestedCount: number;
  remainingToday: number;
  estimatedDuration: string;
  upgradeRoadmap?: UpgradeStep[];
}

export interface UpgradeStep {
  title: string;
  description: string;
  completed: boolean;
  action?: string;
  link?: string;
}

// ===== CONSTANTS =====

export const TIER_LIMITS: Record<MessagingTier, number> = {
  'TIER_250': 250,
  'TIER_1K': 1000,
  'TIER_2K': 2000,
  'TIER_10K': 10000,
  'TIER_100K': 100000,
  'TIER_UNLIMITED': Infinity,
};

export const TIER_DISPLAY_NAMES: Record<MessagingTier, string> = {
  'TIER_250': 'Iniciante (250/dia)',
  'TIER_1K': 'Básico (1K/dia)',
  'TIER_2K': 'Verificado (2K/dia)',
  'TIER_10K': 'Crescimento (10K/dia)',
  'TIER_100K': 'Escala (100K/dia)',
  'TIER_UNLIMITED': 'Ilimitado',
};

export const THROUGHPUT_LIMITS: Record<ThroughputLevel, number> = {
  'STANDARD': 80,
  'HIGH': 1000,
};

// Default limits for new/unverified accounts
// Qualidade assume GREEN por padrão (comportamento da Meta para contas sem histórico negativo)
export const DEFAULT_LIMITS: AccountLimits = {
  messagingTier: 'TIER_250',
  maxUniqueUsersPerDay: 250,
  throughputLevel: 'STANDARD',
  maxMessagesPerSecond: 80,
  qualityScore: 'GREEN',
  usedToday: 0,
  lastFetched: new Date().toISOString(),
};

// 🧪 DEBUG: Set to true to test with a very low limit (5 messages)
// This will trigger the block modal even with few contacts
export const DEBUG_LOW_LIMIT = false;

export const TEST_LIMITS: AccountLimits = {
  messagingTier: 'TIER_250',
  maxUniqueUsersPerDay: 5, // Very low for testing!
  throughputLevel: 'STANDARD',
  maxMessagesPerSecond: 80,
  qualityScore: 'GREEN',
  usedToday: 0,
  lastFetched: new Date().toISOString(),
};

// ===== VALIDATION =====

/**
 * Valida se uma campanha pode ser enviada com base nos limites atuais da conta.
 *
 * Esta é a função principal que evita que o usuário dispare campanhas acima do
 * tier diário ou em situações com risco (ex.: qualidade baixa).
 *
 * @param contactCount Quantidade de contatos/destinatários pretendida.
 * @param limits Limites atuais da conta (tier, throughput, qualidade, uso do dia).
 * @returns Resultado de validação com `canSend`, avisos e, quando bloqueado, motivo e roadmap.
 */
export function validateCampaign(
  contactCount: number,
  limits: AccountLimits
): CampaignValidation {
  const warnings: string[] = [];
  const usedToday = limits.usedToday || 0;
  const remainingToday = Math.max(0, limits.maxUniqueUsersPerDay - usedToday);

  // Calculate estimated duration
  const effectiveMps = limits.maxMessagesPerSecond * 0.9; // 90% safety margin
  const durationSeconds = contactCount / effectiveMps;
  const estimatedDuration = formatDuration(durationSeconds);

  // Base validation result
  const baseResult = {
    currentTier: limits.messagingTier,
    currentLimit: limits.maxUniqueUsersPerDay,
    requestedCount: contactCount,
    remainingToday,
    estimatedDuration,
  };

  // UNLIMITED tier - always allow
  if (limits.messagingTier === 'TIER_UNLIMITED') {
    // Still check quality
    if (limits.qualityScore === 'RED') {
      warnings.push('⚠️ Sua conta está com qualidade BAIXA. A Meta pode limitar seus envios.');
    }

    return {
      ...baseResult,
      canSend: true,
      warnings,
    };
  }

  // Check if campaign exceeds daily limit
  if (contactCount > limits.maxUniqueUsersPerDay) {
    return {
      ...baseResult,
      canSend: false,
      blockedReason: `Esta campanha tem ${contactCount.toLocaleString('pt-BR')} contatos, mas seu limite diário é de ${limits.maxUniqueUsersPerDay.toLocaleString('pt-BR')} usuários.`,
      warnings,
      upgradeRoadmap: getUpgradeRoadmap(limits),
    };
  }

  // Check if campaign exceeds remaining quota for today
  if (contactCount > remainingToday && remainingToday < limits.maxUniqueUsersPerDay) {
    return {
      ...baseResult,
      canSend: false,
      blockedReason: `Você já utilizou ${usedToday.toLocaleString('pt-BR')} do seu limite hoje. Restam apenas ${remainingToday.toLocaleString('pt-BR')} usuários disponíveis.`,
      warnings,
      upgradeRoadmap: getUpgradeRoadmap(limits),
    };
  }

  // Quality warnings
  if (limits.qualityScore === 'RED') {
    warnings.push('⚠️ Sua conta está com qualidade BAIXA. Melhore a qualidade para evitar bloqueios.');
  } else if (limits.qualityScore === 'YELLOW') {
    warnings.push('📊 Sua conta está com qualidade MÉDIA. Continue enviando mensagens relevantes.');
  }

  // Large campaign warning
  if (contactCount > 5000 && limits.throughputLevel === 'STANDARD') {
    warnings.push(`📦 Campanha grande detectada. Tempo estimado: ${estimatedDuration}`);
  }

  // Near limit warning
  const usagePercent = (contactCount / limits.maxUniqueUsersPerDay) * 100;
  if (usagePercent > 80) {
    warnings.push(`⚡ Esta campanha usará ${usagePercent.toFixed(0)}% do seu limite diário.`);
  }

  return {
    ...baseResult,
    canSend: true,
    warnings,
  };
}

// ===== UPGRADE ROADMAP =====

/**
 * Retorna um guia passo a passo (roadmap) para aumentar o tier de mensagens.
 *
 * O roadmap varia conforme o tier atual e o score de qualidade.
 *
 * @param limits Limites atuais da conta.
 * @returns Lista de passos sugeridos para upgrade.
 */
export function getUpgradeRoadmap(limits: AccountLimits): UpgradeStep[] {
  const steps: UpgradeStep[] = [];

  // Tier 250 -> 2K (need business verification OR high quality sending)
  if (limits.messagingTier === 'TIER_250') {
    steps.push({
      title: '1. Verificar sua empresa',
      description: 'Complete a verificação de empresa no Meta Business Suite para liberar o tier de 2.000 usuários/dia.',
      completed: false,
      action: 'Verificar Empresa',
      link: 'https://business.facebook.com/settings/security',
    });

    steps.push({
      title: '2. Alternativa: Enviar mensagens de qualidade',
      description: 'Envie 2.000 mensagens entregues para usuários únicos em 30 dias, mantendo alta qualidade.',
      completed: false,
    });

    steps.push({
      title: '3. Manter qualidade alta',
      description: 'Evite que usuários marquem suas mensagens como spam. Qualidade deve ser VERDE ou AMARELA.',
      completed: limits.qualityScore === 'GREEN' || limits.qualityScore === 'YELLOW',
    });
  }

  // Tier 2K -> 10K (automatic scaling)
  if (limits.messagingTier === 'TIER_2K') {
    steps.push({
      title: '1. Utilizar 50%+ do limite atual',
      description: 'Nos últimos 7 dias, utilize pelo menos 50% do seu limite (1.000+ usuários).',
      completed: false,
    });

    steps.push({
      title: '2. Manter qualidade alta',
      description: 'Sua qualidade de mensagem deve ser VERDE ou AMARELA.',
      completed: limits.qualityScore === 'GREEN' || limits.qualityScore === 'YELLOW',
    });

    steps.push({
      title: '3. Aguardar upgrade automático',
      description: 'A Meta aumenta automaticamente seu tier em até 6 horas após atingir os critérios.',
      completed: false,
    });
  }

  // Tier 10K -> 100K (same as above)
  if (limits.messagingTier === 'TIER_10K') {
    steps.push({
      title: '1. Utilizar 50%+ do limite atual',
      description: 'Nos últimos 7 dias, utilize pelo menos 50% do seu limite (5.000+ usuários).',
      completed: false,
    });

    steps.push({
      title: '2. Manter qualidade alta',
      description: 'Sua qualidade de mensagem deve ser VERDE ou AMARELA.',
      completed: limits.qualityScore === 'GREEN' || limits.qualityScore === 'YELLOW',
    });
  }

  // Tier 100K -> Unlimited
  if (limits.messagingTier === 'TIER_100K') {
    steps.push({
      title: '1. Utilizar 50%+ do limite atual',
      description: 'Nos últimos 7 dias, utilize pelo menos 50% do seu limite (50.000+ usuários).',
      completed: false,
    });

    steps.push({
      title: '2. Manter qualidade alta',
      description: 'Sua qualidade de mensagem deve ser VERDE ou AMARELA.',
      completed: limits.qualityScore === 'GREEN' || limits.qualityScore === 'YELLOW',
    });
  }

  return steps;
}

/**
 * Retorna o próximo tier após o tier atual (na ordem de upgrade).
 *
 * @param currentTier Tier atual.
 * @returns Próximo tier, ou `null` se já estiver no máximo/ desconhecido.
 */
export function getNextTier(currentTier: MessagingTier): MessagingTier | null {
  const tierOrder: MessagingTier[] = [
    'TIER_250', 'TIER_2K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'
  ];

  const currentIndex = tierOrder.indexOf(currentTier);
  if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
    return null;
  }

  return tierOrder[currentIndex + 1];
}

// ===== API FETCHING =====

/**
 * Busca os limites atuais da conta no Graph API da Meta.
 *
 * A consulta tenta obter em paralelo:
 * - throughput e quality_score
 * - messaging limit (tier)
 *
 * @param phoneNumberId Phone Number ID (Cloud API).
 * @param accessToken Access Token do Meta com permissões adequadas.
 * @returns Limites normalizados ({@link AccountLimits}); em caso de falha retorna {@link DEFAULT_LIMITS}.
 */
export async function fetchAccountLimits(
  phoneNumberId: string,
  accessToken: string
): Promise<AccountLimits> {
  const baseUrl = 'https://graph.facebook.com/v24.0';

  try {
    // Parallel fetch for better performance
    const [throughputResponse, tierResponse] = await Promise.all([
      fetch(
        `${baseUrl}/${phoneNumberId}?fields=throughput,quality_score`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      ),
      fetch(
        `${baseUrl}/${phoneNumberId}?fields=whatsapp_business_manager_messaging_limit`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      ),
    ]);

    if (!throughputResponse.ok || !tierResponse.ok) {
      console.warn('⚠️ Failed to fetch account limits, using defaults');
      return DEFAULT_LIMITS;
    }

    const [throughputData, tierData] = await Promise.all([
      throughputResponse.json(),
      tierResponse.json(),
    ]);

    // Parse throughput level
    const throughputLevel: ThroughputLevel =
      throughputData.throughput?.level === 'high' ? 'HIGH' : 'STANDARD';

    // Parse quality score
    // Se o campo não for retornado pela API, assume GREEN (comportamento padrão da Meta)
    const rawQuality = throughputData.quality_score?.score?.toUpperCase();
    const qualityScore: QualityScore =
      ['GREEN', 'YELLOW', 'RED'].includes(rawQuality) ? rawQuality : 'GREEN';

    // Parse messaging tier
    const rawTier = tierData.whatsapp_business_manager_messaging_limit || 'TIER_250';
    const messagingTier = rawTier as MessagingTier;

    return {
      messagingTier,
      maxUniqueUsersPerDay: TIER_LIMITS[messagingTier] || 250,
      throughputLevel,
      maxMessagesPerSecond: THROUGHPUT_LIMITS[throughputLevel],
      qualityScore,
      usedToday: 0, // TODO: Track this via webhooks or analytics
      lastFetched: new Date().toISOString(),
    };

  } catch (error) {
    console.error('❌ Error fetching account limits:', error);
    return DEFAULT_LIMITS;
  }
}

// ===== UTILITIES =====

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    const secs = Math.ceil(seconds);
    return `${secs} segundo${secs !== 1 ? 's' : ''}`;
  } else if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return `${hours}h ${minutes}min`;
  }
}

// ===== STORAGE =====

export const LIMITS_STORAGE_KEY = 'dispara_account_limits';

/**
 * Obtém limites cacheados do `localStorage`.
 *
 * Em SSR (sem `window`), retorna `null`.
 *
 * @returns Limites cacheados, ou `null` se ausentes/ inválidos.
 */
export function getCachedLimits(): AccountLimits | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(LIMITS_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Salva os limites no `localStorage` para reutilização posterior.
 *
 * Em SSR (sem `window`), não faz nada.
 *
 * @param limits Limites a persistir no cache do navegador.
 * @returns Nada.
 */
export function cacheLimits(limits: AccountLimits): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LIMITS_STORAGE_KEY, JSON.stringify(limits));
}

/**
 * Verifica se os limites cacheados estão "stale" (mais antigos que 1 hora).
 *
 * @param limits Limites cacheados (ou `null`).
 * @returns `true` se estiverem ausentes ou expirados; caso contrário `false`.
 */
export function areLimitsStale(limits: AccountLimits | null): boolean {
  if (!limits) return true;
  const lastFetched = new Date(limits.lastFetched);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return lastFetched < oneHourAgo;
}
