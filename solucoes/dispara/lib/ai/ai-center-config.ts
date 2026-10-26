import { supabase } from '@/lib/supabase'
import {
  DEFAULT_AI_FALLBACK,
  DEFAULT_AI_GATEWAY,
  DEFAULT_AI_PROMPTS,
  DEFAULT_AI_ROUTES,
  type AiFallbackConfig,
  type AiGatewayConfig,
  type AiPromptsConfig,
  type AiRoutesConfig,
} from './ai-center-defaults'

const SETTINGS_KEYS = {
  routes: 'ai_routes',
  fallback: 'ai_fallback',
  prompts: 'ai_prompts',
  gateway: 'ai_gateway',
  // Chaves individuais para prompts de estratégia (fonte única de verdade: banco)
  strategyMarketing: 'strategyMarketing',
  strategyUtility: 'strategyUtility',
  strategyBypass: 'strategyBypass',
} as const

const CACHE_TTL = 60000
let cacheTime = 0
let cachedRoutes: AiRoutesConfig | null = null
let cachedFallback: AiFallbackConfig | null = null
let cachedPrompts: AiPromptsConfig | null = null
let cachedGateway: AiGatewayConfig | null = null

function parseJsonSetting<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeRoutes(input?: Partial<AiRoutesConfig> | null): AiRoutesConfig {
  const next = { ...DEFAULT_AI_ROUTES, ...(input || {}) }
  return {
    generateUtilityTemplates: !!next.generateUtilityTemplates,
    generateFlowForm: !!next.generateFlowForm,
  }
}

function normalizeFallback(input?: Partial<AiFallbackConfig> | null): AiFallbackConfig {
  const next = { ...DEFAULT_AI_FALLBACK, ...(input || {}) }
  const providers = Object.keys(DEFAULT_AI_FALLBACK.models) as Array<keyof AiFallbackConfig['models']>
  const legacyProvider = (input as Partial<{ provider: keyof AiFallbackConfig['models'] }>)?.provider
  const legacyModel = (input as Partial<{ model: string }>)?.model
  const rawOrder = Array.isArray(next.order) ? next.order : []
  const normalizedOrder = rawOrder.filter((provider) => providers.includes(provider))
  const uniqueOrder = Array.from(new Set(normalizedOrder))
  const legacyOrder = legacyProvider && providers.includes(legacyProvider)
    ? [legacyProvider, ...DEFAULT_AI_FALLBACK.order.filter((p) => p !== legacyProvider)]
    : DEFAULT_AI_FALLBACK.order
  const order = uniqueOrder.length > 0 ? uniqueOrder : legacyOrder
  const rawModels = (next.models || {}) as AiFallbackConfig['models']
  const models = providers.reduce((acc, provider) => {
    const value = rawModels[provider]
    acc[provider] = typeof value === 'string' && value.trim() ? value : DEFAULT_AI_FALLBACK.models[provider]
    return acc
  }, {} as AiFallbackConfig['models'])
  if (legacyProvider && providers.includes(legacyProvider) && typeof legacyModel === 'string' && legacyModel.trim()) {
    models[legacyProvider] = legacyModel
  }
  return {
    enabled: !!next.enabled,
    order,
    models,
  }
}

function normalizeGateway(input?: Partial<AiGatewayConfig> | null): AiGatewayConfig {
  const next = { ...DEFAULT_AI_GATEWAY, ...(input || {}) }

  // Valida que fallbackModels tem o formato correto (provider/model)
  const rawFallbackModels = Array.isArray(next.fallbackModels) ? next.fallbackModels : []
  const validFallbackModels = rawFallbackModels.filter((m) => {
    if (typeof m !== 'string') return false
    const parts = m.split('/')
    return parts.length === 2 && ['google', 'openai', 'anthropic'].includes(parts[0])
  })

  return {
    enabled: !!next.enabled,
    apiKey: typeof next.apiKey === 'string' ? next.apiKey.trim() : '',
    useBYOK: next.useBYOK !== false, // default true
    fallbackModels: validFallbackModels.length > 0 ? validFallbackModels : DEFAULT_AI_GATEWAY.fallbackModels,
  }
}

// Normaliza prompts gerais (usa defaults do código como fallback)
function normalizeBasePrompts(input?: Partial<AiPromptsConfig> | null): Omit<AiPromptsConfig, 'strategyMarketing' | 'strategyUtility' | 'strategyBypass'> {
  const next = { ...DEFAULT_AI_PROMPTS, ...(input || {}) }
  return {
    utilityGenerationTemplate: next.utilityGenerationTemplate || DEFAULT_AI_PROMPTS.utilityGenerationTemplate,
    utilityJudgeTemplate: next.utilityJudgeTemplate || DEFAULT_AI_PROMPTS.utilityJudgeTemplate,
    flowFormTemplate: next.flowFormTemplate || DEFAULT_AI_PROMPTS.flowFormTemplate,
  }
}

// Normaliza prompts de estratégia (banco tem prioridade, código é fallback)
function normalizeStrategyPrompts(strategies: {
  marketing: string | null
  utility: string | null
  bypass: string | null
}): Pick<AiPromptsConfig, 'strategyMarketing' | 'strategyUtility' | 'strategyBypass'> {
  return {
    // Se banco vazio, usa prompt do código como fallback
    strategyMarketing: strategies.marketing || DEFAULT_AI_PROMPTS.strategyMarketing,
    strategyUtility: strategies.utility || DEFAULT_AI_PROMPTS.strategyUtility,
    strategyBypass: strategies.bypass || DEFAULT_AI_PROMPTS.strategyBypass,
  }
}

// Função de compatibilidade para preparar updates (mantém comportamento antigo)
function normalizePrompts(input?: Partial<AiPromptsConfig> | null): AiPromptsConfig {
  const next = { ...DEFAULT_AI_PROMPTS, ...(input || {}) }
  return {
    utilityGenerationTemplate: next.utilityGenerationTemplate || DEFAULT_AI_PROMPTS.utilityGenerationTemplate,
    utilityJudgeTemplate: next.utilityJudgeTemplate || DEFAULT_AI_PROMPTS.utilityJudgeTemplate,
    flowFormTemplate: next.flowFormTemplate || DEFAULT_AI_PROMPTS.flowFormTemplate,
    // Para updates, mantém o valor do input (sem fallback de código)
    strategyMarketing: next.strategyMarketing || '',
    strategyUtility: next.strategyUtility || '',
    strategyBypass: next.strategyBypass || '',
  }
}

async function getSettingValue(key: string): Promise<string | null> {
  const { data, error } = await supabase.admin
    ?.from('settings')
    .select('value')
    .eq('key', key)
    .single() || { data: null, error: null }

  if (error || !data) return null
  return data.value
}

function isCacheValid(): boolean {
  return Date.now() - cacheTime < CACHE_TTL
}

export async function getAiRoutesConfig(): Promise<AiRoutesConfig> {
  if (cachedRoutes && isCacheValid()) return cachedRoutes
  const raw = await getSettingValue(SETTINGS_KEYS.routes)
  const parsed = parseJsonSetting<Partial<AiRoutesConfig>>(raw, DEFAULT_AI_ROUTES)
  cachedRoutes = normalizeRoutes(parsed)
  cacheTime = Date.now()
  return cachedRoutes
}

export async function getAiFallbackConfig(): Promise<AiFallbackConfig> {
  if (cachedFallback && isCacheValid()) return cachedFallback
  const raw = await getSettingValue(SETTINGS_KEYS.fallback)
  const parsed = parseJsonSetting<Partial<AiFallbackConfig>>(raw, DEFAULT_AI_FALLBACK)
  cachedFallback = normalizeFallback(parsed)
  cacheTime = Date.now()
  return cachedFallback
}

export async function getAiPromptsConfig(): Promise<AiPromptsConfig> {
  if (cachedPrompts && isCacheValid()) return cachedPrompts

  // Busca prompts base do JSON ai_prompts
  const rawBase = await getSettingValue(SETTINGS_KEYS.prompts)
  const parsedBase = parseJsonSetting<Partial<AiPromptsConfig>>(rawBase, {})
  const basePrompts = normalizeBasePrompts(parsedBase)

  // Busca prompts de estratégia das chaves individuais (fonte única: banco)
  const [marketing, utility, bypass] = await Promise.all([
    getSettingValue(SETTINGS_KEYS.strategyMarketing),
    getSettingValue(SETTINGS_KEYS.strategyUtility),
    getSettingValue(SETTINGS_KEYS.strategyBypass),
  ])
  const strategyPrompts = normalizeStrategyPrompts({ marketing, utility, bypass })

  // Combina os dois
  cachedPrompts = {
    ...basePrompts,
    ...strategyPrompts,
  }
  cacheTime = Date.now()
  return cachedPrompts
}

export async function getAiGatewayConfig(): Promise<AiGatewayConfig> {
  if (cachedGateway && isCacheValid()) return cachedGateway
  const raw = await getSettingValue(SETTINGS_KEYS.gateway)
  const parsed = parseJsonSetting<Partial<AiGatewayConfig>>(raw, DEFAULT_AI_GATEWAY)
  cachedGateway = normalizeGateway(parsed)
  cacheTime = Date.now()
  return cachedGateway
}

export async function isAiRouteEnabled(routeKey: keyof AiRoutesConfig): Promise<boolean> {
  const routes = await getAiRoutesConfig()
  return routes[routeKey]
}

export function prepareAiRoutesUpdate(input?: Partial<AiRoutesConfig> | null): AiRoutesConfig {
  return normalizeRoutes(input)
}

export function prepareAiFallbackUpdate(input?: Partial<AiFallbackConfig> | null): AiFallbackConfig {
  return normalizeFallback(input)
}

export function prepareAiPromptsUpdate(input?: Partial<AiPromptsConfig> | null): AiPromptsConfig {
  return normalizePrompts(input)
}

export function prepareAiGatewayUpdate(input?: Partial<AiGatewayConfig> | null): AiGatewayConfig {
  return normalizeGateway(input)
}

export function clearAiCenterCache() {
  cacheTime = 0
  cachedRoutes = null
  cachedFallback = null
  cachedPrompts = null
  cachedGateway = null
}
