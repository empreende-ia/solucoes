/**
 * OCR Provider Factory
 *
 * Gerencia a criação e seleção de providers de OCR.
 * Busca configurações do Supabase (settings) e faz fallback para env vars.
 *
 * Configurações no banco:
 * - `ocr_provider`: 'gemini' | 'mistral' (default: 'gemini')
 * - `ocr_gemini_model`: modelo Gemini para OCR (default: 'gemini-2.5-flash')
 * - `gemini_api_key`: API key do Gemini (fallback: env GEMINI_API_KEY)
 * - `mistral_api_key`: API key do Mistral (fallback: env MISTRAL_API_KEY)
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { GeminiOCRProvider, DEFAULT_OCR_MODEL } from './providers/gemini'
import { MistralOCRProvider } from './providers/mistral'
import type { OCRProvider } from './types'

/** Providers de OCR disponíveis */
export type OCRProviderName = 'gemini' | 'mistral'

/** Provider padrão quando nenhum é especificado */
const DEFAULT_PROVIDER: OCRProviderName = 'gemini'

/**
 * Obtém um provider de OCR configurado
 *
 * @param preferredProvider - Provider preferido (sobrescreve config do banco)
 * @returns Provider configurado ou null se nenhum estiver disponível
 *
 * @example
 * ```ts
 * // Usar provider configurado no banco/default
 * const provider = await getOCRProvider()
 *
 * // Forçar Mistral específico
 * const mistral = await getOCRProvider('mistral')
 * ```
 */
export async function getOCRProvider(
  preferredProvider?: OCRProviderName
): Promise<OCRProvider | null> {
  const supabase = getSupabaseAdmin()

  // Se não tiver Supabase, usar apenas env vars
  let settingsMap = new Map<string, string>()

  if (supabase) {
    const { data: settings } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['gemini_api_key', 'mistral_api_key', 'ocr_provider', 'ocr_gemini_model'])

    settingsMap = new Map(settings?.map((s) => [s.key, s.value]) || [])
  }

  // Determinar qual provider usar (parâmetro > banco > default)
  const providerName =
    preferredProvider || (settingsMap.get('ocr_provider') as OCRProviderName) || DEFAULT_PROVIDER

  // Obter API keys (banco > env)
  const geminiKey =
    settingsMap.get('gemini_api_key') ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  const mistralKey = settingsMap.get('mistral_api_key') || process.env.MISTRAL_API_KEY

  // Modelo Gemini para OCR (banco > default)
  const geminiOcrModel = settingsMap.get('ocr_gemini_model') || DEFAULT_OCR_MODEL

  // Factories para cada provider
  const providers: Record<OCRProviderName, () => OCRProvider | null> = {
    gemini: () => (geminiKey ? new GeminiOCRProvider(geminiKey, geminiOcrModel) : null),
    mistral: () => (mistralKey ? new MistralOCRProvider(mistralKey) : null),
  }

  // Tentar provider preferido primeiro
  let provider = providers[providerName]?.()

  // Fallback: tentar outros providers se o preferido não estiver configurado
  if (!provider) {
    for (const [name, factory] of Object.entries(providers)) {
      if (name !== providerName) {
        provider = factory()
        if (provider) {
          console.log(`[ocr] Fallback to ${name} (${providerName} not configured)`)
          break
        }
      }
    }
  }

  if (!provider) {
    console.warn('[ocr] No OCR provider available - check API keys')
  }

  return provider
}

/**
 * Lista providers disponíveis (com API key configurada)
 */
export async function getAvailableOCRProviders(): Promise<OCRProviderName[]> {
  const supabase = getSupabaseAdmin()
  const available: OCRProviderName[] = []

  let settingsMap = new Map<string, string>()

  if (supabase) {
    const { data: settings } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['gemini_api_key', 'mistral_api_key'])

    settingsMap = new Map(settings?.map((s) => [s.key, s.value]) || [])
  }

  // Verificar Gemini
  const geminiKey =
    settingsMap.get('gemini_api_key') ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  if (geminiKey) available.push('gemini')

  // Verificar Mistral
  const mistralKey = settingsMap.get('mistral_api_key') || process.env.MISTRAL_API_KEY
  if (mistralKey) available.push('mistral')

  return available
}
