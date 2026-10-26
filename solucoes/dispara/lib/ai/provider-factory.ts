/**
 * AI Provider Factory
 *
 * Factory para criar modelos de IA de diferentes providers (Google, OpenAI, Anthropic).
 * Usado pelos agentes de IA para suportar múltiplos providers com a mesma interface.
 *
 * O Vercel AI SDK garante que tools funcionam de forma idêntica em todos os providers.
 *
 * Suporta:
 * - Vercel AI Gateway: Roteamento inteligente com fallbacks automáticos
 * - Helicone: Proxy para observability (quando Gateway desabilitado)
 * - Conexão direta: Sem proxy (fallback)
 */

import type { LanguageModel } from 'ai'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAiGatewayConfig } from './ai-center-config'
import { toGatewayModelId, type AiGatewayConfig } from './ai-center-defaults'

// =============================================================================
// Vercel AI Gateway Configuration
// =============================================================================

const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1'

// =============================================================================
// Helicone Configuration (usado quando AI Gateway está desabilitado)
// =============================================================================

// Helicone gateway config por provider
// Para Google: usar gateway genérico + Helicone-Target-URL header
// Para OpenAI/Anthropic: usar gateways dedicados
const HELICONE_GATEWAYS: Record<AIProvider, { baseURL: string; targetURL?: string }> = {
  google: {
    baseURL: 'https://gateway.helicone.ai/v1beta',
    targetURL: 'https://generativelanguage.googleapis.com/v1beta',
  },
  openai: {
    baseURL: 'https://oai.helicone.ai/v1',
  },
  anthropic: {
    baseURL: 'https://anthropic.helicone.ai/v1',
  },
}

/**
 * Busca configuração do Helicone do banco de dados.
 * Retorna null se não configurado ou desabilitado.
 */
async function getHeliconeConfig(): Promise<{ apiKey: string } | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null

  try {
    const { data: settings } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['helicone_enabled', 'helicone_api_key'])

    if (!settings || settings.length === 0) return null

    const configMap = Object.fromEntries(settings.map(s => [s.key, s.value]))
    const enabled = configMap['helicone_enabled'] === 'true'
    const apiKey = configMap['helicone_api_key']

    if (!enabled || !apiKey) return null

    return { apiKey }
  } catch (error) {
    console.error('[provider-factory] Error fetching Helicone config:', error)
    return null
  }
}

/**
 * Cria modelo de linguagem via Vercel AI Gateway.
 *
 * O Gateway usa autenticação OIDC (não API key manual):
 * - Em Vercel (prod/preview): token OIDC é injetado automaticamente
 * - Local com `vercel dev`: token é obtido automaticamente
 * - Local com `npm run dev`: requer `vercel env pull` (token expira a cada 12h)
 *
 * @param gatewayConfig Configuração do Gateway
 * @param provider Provider original (google, openai, anthropic)
 * @param modelId ID do modelo (ex: gemini-2.5-flash)
 * @param allApiKeys Todas as API keys disponíveis (para BYOK com fallbacks)
 */
async function createGatewayModel(
  gatewayConfig: AiGatewayConfig,
  provider: AIProvider,
  modelId: string,
  allApiKeys: Partial<Record<AIProvider, string>>
): Promise<LanguageModel> {
  // OIDC token já foi verificado antes de chamar esta função
  const oidcToken = process.env.VERCEL_OIDC_TOKEN!

  const { createOpenAI } = await import('@ai-sdk/openai')

  const gatewayModelId = toGatewayModelId(provider, modelId)

  // Headers para o Gateway - apenas OIDC
  // NOTA: BYOK agora é configurado via providerOptions.gateway.byok no generateText,
  // não mais via headers. Isso permite usar 'only' para forçar BYOK-only (sem fallback para system credentials).
  const headers: Record<string, string> = {
    // Token OIDC para autenticação no Gateway
    Authorization: `Bearer ${oidcToken}`,
  }

  if (gatewayConfig.useBYOK) {
    const configuredProviders = Object.keys(allApiKeys).filter(p => allApiKeys[p as AIProvider])
    console.log(`[provider-factory] BYOK will be configured via providerOptions.gateway for: ${configuredProviders.join(', ')}`)
  }

  const openai = createOpenAI({
    apiKey: 'dummy', // Não usado, autenticação é via OIDC
    baseURL: AI_GATEWAY_BASE_URL,
    headers,
  })

  console.log(`[provider-factory] AI Gateway enabled: ${gatewayModelId}`)

  return openai(gatewayModelId)
}

// =============================================================================
// Types
// =============================================================================

export type AIProvider = 'google' | 'openai' | 'anthropic'

export interface ProviderConfig {
  provider: AIProvider
  model: string
  apiKey: string
}

// Mapeamento de provider para chave de API na tabela settings
const PROVIDER_API_KEY_MAP: Record<AIProvider, { settingKey: string; envVar: string }> = {
  google: { settingKey: 'gemini_api_key', envVar: 'GEMINI_API_KEY' },
  openai: { settingKey: 'openai_api_key', envVar: 'OPENAI_API_KEY' },
  anthropic: { settingKey: 'anthropic_api_key', envVar: 'ANTHROPIC_API_KEY' },
}

// =============================================================================
// Provider Detection
// =============================================================================

/**
 * Detecta o provider baseado no nome do modelo.
 *
 * - gemini-* → google
 * - gpt-* → openai
 * - claude-* → anthropic
 */
export function getProviderFromModel(modelId: string): AIProvider {
  if (modelId.startsWith('gemini')) return 'google'
  if (modelId.startsWith('gpt')) return 'openai'
  if (modelId.startsWith('claude')) return 'anthropic'
  return 'google' // default
}

// =============================================================================
// API Key Fetching
// =============================================================================

/**
 * Busca a API key do provider no banco de dados ou variáveis de ambiente.
 */
export async function getProviderApiKey(provider: AIProvider): Promise<string | null> {
  const config = PROVIDER_API_KEY_MAP[provider]

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', config.settingKey)
      .maybeSingle()

    if (data?.value) {
      return data.value
    }
  }

  // Fallback para variável de ambiente
  return process.env[config.envVar] || null
}

/**
 * Busca todas as API keys de todos os providers em uma única query.
 * Usado pelo AI Gateway para habilitar fallbacks entre providers.
 */
export async function getAllProviderApiKeys(): Promise<Partial<Record<AIProvider, string>>> {
  const result: Partial<Record<AIProvider, string>> = {}
  const allSettingKeys = Object.values(PROVIDER_API_KEY_MAP).map(c => c.settingKey)

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', allSettingKeys)

    if (data) {
      // Mapeia setting key de volta para provider
      const settingToProvider: Record<string, AIProvider> = {
        gemini_api_key: 'google',
        openai_api_key: 'openai',
        anthropic_api_key: 'anthropic',
      }

      for (const setting of data) {
        const provider = settingToProvider[setting.key]
        if (provider && setting.value) {
          result[provider] = setting.value
        }
      }
    }
  }

  // Fallback para variáveis de ambiente (para keys não encontradas no DB)
  for (const [provider, config] of Object.entries(PROVIDER_API_KEY_MAP)) {
    if (!result[provider as AIProvider]) {
      const envValue = process.env[config.envVar]
      if (envValue) {
        result[provider as AIProvider] = envValue
      }
    }
  }

  return result
}

// =============================================================================
// Model Factory
// =============================================================================

/**
 * Cria um modelo de linguagem do provider apropriado.
 *
 * Esta função é provider-agnostic - retorna um modelo compatível com
 * generateText/streamText que funciona com tools de forma idêntica.
 *
 * Prioridade de routing:
 * 1. AI Gateway (se habilitado) - roteamento inteligente com fallbacks
 * 2. Helicone (se habilitado) - observability
 * 3. Conexão direta - sem proxy
 */
export interface CreateLanguageModelResult {
  model: LanguageModel
  provider: AIProvider
  apiKey: string
  gatewayConfig?: AiGatewayConfig
  /** Todas as API keys configuradas (para BYOK no providerOptions.gateway) */
  allApiKeys?: Partial<Record<AIProvider, string>>
  /** Se está usando o AI Gateway (para decidir se passa providerOptions) */
  usingGateway: boolean
}

export async function createLanguageModel(
  modelId: string,
  apiKeyOverride?: string
): Promise<CreateLanguageModelResult> {
  const provider = getProviderFromModel(modelId)

  // Verifica se AI Gateway está habilitado
  const gatewayConfig = await getAiGatewayConfig()

  // Gateway requer OIDC token (disponível em Vercel ou via `vercel dev`)
  const oidcToken = process.env.VERCEL_OIDC_TOKEN
  const canUseGateway = gatewayConfig.enabled && oidcToken

  if (gatewayConfig.enabled && !oidcToken) {
    console.warn('[provider-factory] Gateway habilitado mas VERCEL_OIDC_TOKEN não encontrado. Usando conexão direta.')
  }

  if (canUseGateway) {
    // Busca TODAS as API keys para habilitar fallbacks no Gateway
    const allApiKeys = await getAllProviderApiKeys()
    const primaryApiKey = apiKeyOverride || allApiKeys[provider]

    if (!primaryApiKey) {
      throw new Error(
        `API key não configurada para ${provider}. Configure em Configurações > IA.`
      )
    }

    // Se tiver override, usa ele como chave do provider primário
    if (apiKeyOverride) {
      allApiKeys[provider] = apiKeyOverride
    }

    // Usa AI Gateway para routing inteligente com fallbacks
    const model = await createGatewayModel(gatewayConfig, provider, modelId, allApiKeys)
    return { model, provider, apiKey: primaryApiKey, gatewayConfig, allApiKeys, usingGateway: true }
  }

  // Conexão direta: busca apenas a chave do provider primário
  const apiKey = apiKeyOverride || (await getProviderApiKey(provider))

  if (!apiKey) {
    throw new Error(
      `API key não configurada para ${provider}. Configure em Configurações > IA.`
    )
  }

  // Fallback: Helicone ou conexão direta
  let model: LanguageModel

  // Fetch Helicone config from database
  const heliconeConfig = await getHeliconeConfig()
  const heliconeEnabled = heliconeConfig !== null

  // Build Helicone headers if enabled (per-provider)
  const buildHeliconeHeaders = (prov: AIProvider) => {
    if (!heliconeConfig) return undefined
    const gateway = HELICONE_GATEWAYS[prov]
    return {
      'Helicone-Auth': `Bearer ${heliconeConfig.apiKey}`,
      ...(gateway.targetURL && { 'Helicone-Target-URL': gateway.targetURL }),
    }
  }

  switch (provider) {
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      const heliconeHeaders = buildHeliconeHeaders('google')
      const google = createGoogleGenerativeAI({
        apiKey,
        ...(heliconeEnabled && {
          baseURL: HELICONE_GATEWAYS.google.baseURL,
          headers: heliconeHeaders,
        }),
      })
      model = google(modelId)
      if (heliconeEnabled) {
        console.log(`[provider-factory] Helicone proxy enabled for Google`)
      }
      break
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const heliconeHeaders = buildHeliconeHeaders('openai')
      const openai = createOpenAI({
        apiKey,
        ...(heliconeEnabled && {
          baseURL: HELICONE_GATEWAYS.openai.baseURL,
          headers: heliconeHeaders,
        }),
      })
      model = openai(modelId)
      if (heliconeEnabled) {
        console.log(`[provider-factory] Helicone proxy enabled for OpenAI`)
      }
      break
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      const heliconeHeaders = buildHeliconeHeaders('anthropic')
      const anthropic = createAnthropic({
        apiKey,
        ...(heliconeEnabled && {
          baseURL: HELICONE_GATEWAYS.anthropic.baseURL,
          headers: heliconeHeaders,
        }),
      })
      model = anthropic(modelId)
      if (heliconeEnabled) {
        console.log(`[provider-factory] Helicone proxy enabled for Anthropic`)
      }
      break
    }
    default:
      throw new Error(`Provider não suportado: ${provider}`)
  }

  return { model, provider, apiKey, usingGateway: false }
}

/**
 * Verifica se um modelo é suportado.
 */
export function isSupportedModel(modelId: string): boolean {
  return (
    modelId.startsWith('gemini') ||
    modelId.startsWith('gpt') ||
    modelId.startsWith('claude')
  )
}
