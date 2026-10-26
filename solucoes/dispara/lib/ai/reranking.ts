/**
 * AI Reranking - Opcional para melhorar precisão do RAG
 *
 * Reranking é uma etapa opcional que reordena os resultados da busca
 * por similaridade usando um modelo de reranking.
 *
 * Quando usar:
 * - Knowledge base grande (100+ documentos)
 * - Queries complexas ou ambíguas
 * - Alta precisão necessária
 *
 * Quando NÃO usar:
 * - Knowledge base pequena (poucos documentos)
 * - Queries simples e diretas
 * - Latência crítica (adiciona 200-500ms)
 *
 * NOTA: Reranking requer pacotes adicionais:
 * - Cohere: npm install @ai-sdk/cohere
 * - Together.ai: npm install @ai-sdk/togetherai
 *
 * Por enquanto, reranking está DESABILITADO por padrão.
 * Para habilitar, instale os pacotes e configure no agente.
 */

// =============================================================================
// Types
// =============================================================================

export type RerankProvider = 'cohere' | 'together'

export interface RerankConfig {
  provider: RerankProvider
  model: string
  apiKey: string
  topK?: number
}

export interface RerankResult {
  content: string
  score: number
  originalIndex: number
  metadata?: Record<string, unknown>
}

// Provider info para UI
export interface RerankProviderInfo {
  id: RerankProvider
  name: string
  models: Array<{
    id: string
    name: string
    description: string
    pricePerMillion: number
  }>
  requiresPackage: string
}

// =============================================================================
// Provider Configurations (para UI)
// =============================================================================

export const RERANK_PROVIDERS: RerankProviderInfo[] = [
  {
    id: 'cohere',
    name: 'Cohere',
    requiresPackage: '@ai-sdk/cohere',
    models: [
      {
        id: 'rerank-v3.5',
        name: 'Rerank v3.5',
        description: 'Melhor qualidade, suporte multilíngue',
        pricePerMillion: 0.05,
      },
      {
        id: 'rerank-english-v3.0',
        name: 'Rerank English v3',
        description: 'Otimizado para inglês',
        pricePerMillion: 0.05,
      },
      {
        id: 'rerank-multilingual-v3.0',
        name: 'Rerank Multilingual v3',
        description: 'Suporte a múltiplos idiomas',
        pricePerMillion: 0.05,
      },
    ],
  },
  {
    id: 'together',
    name: 'Together.ai',
    requiresPackage: '@ai-sdk/togetherai',
    models: [
      {
        id: 'Salesforce/Llama-Rank-v1',
        name: 'Llama Rank v1',
        description: 'Baseado no Llama, bom custo-benefício',
        pricePerMillion: 0.1,
      },
    ],
  },
]

// =============================================================================
// Rerank Function
// =============================================================================

/**
 * Reordena documentos por relevância usando modelo de reranking
 *
 * NOTA: Esta função requer pacotes adicionais instalados.
 * Se os pacotes não estiverem disponíveis, retorna os documentos na ordem original.
 *
 * @param query - Query do usuário
 * @param documents - Documentos retornados pela busca de similaridade
 * @param config - Configuração do provider de reranking
 * @returns Documentos reordenados por relevância
 */
export async function rerankDocuments(
  query: string,
  documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
  config: RerankConfig
): Promise<RerankResult[]> {
  if (documents.length === 0) {
    return []
  }

  const topK = config.topK ?? 5

  try {
    // Dynamic import to check if reranking packages are available
    const { rerank } = await import('ai')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let model: any

    switch (config.provider) {
      case 'cohere': {
        try {
          const { createCohere } = await import('@ai-sdk/cohere')
          const cohere = createCohere({ apiKey: config.apiKey })
          model = cohere.reranking(config.model)
        } catch {
          console.warn('[reranking] @ai-sdk/cohere não instalado, pulando reranking')
          return fallbackToOriginalOrder(documents, topK)
        }
        break
      }

      case 'together': {
        try {
          const { createTogetherAI } = await import('@ai-sdk/togetherai')
          const together = createTogetherAI({ apiKey: config.apiKey })
          model = together.reranking(config.model)
        } catch {
          console.warn('[reranking] @ai-sdk/togetherai não instalado, pulando reranking')
          return fallbackToOriginalOrder(documents, topK)
        }
        break
      }

      default:
        console.warn(`[reranking] Provider "${config.provider}" não suportado`)
        return fallbackToOriginalOrder(documents, topK)
    }

    const { ranking } = await rerank({
      model,
      documents: documents.map((d) => d.content),
      query,
      topN: Math.min(topK, documents.length),
    })

    // Mapeia resultados de volta com metadados originais
    return ranking.map((r) => ({
      content: r.document,
      score: r.score,
      originalIndex: r.originalIndex,
      metadata: documents[r.originalIndex]?.metadata,
    }))

  } catch (err) {
    console.error('[reranking] Erro ao fazer reranking:', err)
    return fallbackToOriginalOrder(documents, topK)
  }
}

/**
 * Fallback: retorna documentos na ordem original quando reranking não está disponível
 */
function fallbackToOriginalOrder(
  documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
  topK: number
): RerankResult[] {
  return documents.slice(0, topK).map((d, i) => ({
    content: d.content,
    score: 1 - (i * 0.1), // Score decrescente simulado
    originalIndex: i,
    metadata: d.metadata,
  }))
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Valida se config de reranking é válida
 */
export function validateRerankConfig(config: Partial<RerankConfig>): string | null {
  if (!config.provider) {
    return 'Provider de reranking não configurado'
  }

  if (!config.model) {
    return 'Modelo de reranking não configurado'
  }

  if (!config.apiKey) {
    return 'API key de reranking não configurada'
  }

  const provider = RERANK_PROVIDERS.find((p) => p.id === config.provider)
  if (!provider) {
    return `Provider de reranking "${config.provider}" não suportado`
  }

  const model = provider.models.find((m) => m.id === config.model)
  if (!model) {
    return `Modelo "${config.model}" não encontrado para provider "${config.provider}"`
  }

  return null
}

/**
 * Verifica se reranking está habilitado e configurado corretamente
 */
export function isRerankEnabled(config: {
  rerank_enabled?: boolean | null
  rerank_provider?: string | null
  rerank_model?: string | null
}): boolean {
  return !!(
    config.rerank_enabled &&
    config.rerank_provider &&
    config.rerank_model
  )
}
