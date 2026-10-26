/**
 * Serviço de IA unificado.
 *
 * Centraliza operações de IA na aplicação (geração e streaming), suportando
 * provedores como Google (Gemini), OpenAI (GPT) e Anthropic (Claude).
 *
 * Implementado sobre o Vercel AI SDK v6.
 *
 * Exemplo:
 * - `import { ai } from '@/lib/ai'`
 * - `const result = await ai.generateText({ prompt: 'Olá' })`
 */

import { generateText as vercelGenerateText, streamText as vercelStreamText } from 'ai';

import { supabase } from '@/lib/supabase';
import { type AIProvider, getDefaultModel } from './providers';
import { getAiFallbackConfig, getAiGatewayConfig } from './ai-center-config';
import { toGatewayModelId, type AiGatewayConfig } from './ai-center-defaults';

// =============================================================================
// TYPES
// =============================================================================

export interface AISettings {
    provider: AIProvider;
    model: string;
    apiKey: string;
    providerKeys?: Partial<Record<AIProvider, string>>;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface GenerateTextOptions {
    /** Prompt simples (mutuamente exclusivo com `messages`). */
    prompt?: string;
    /** Mensagens da conversa (mutuamente exclusivo com `prompt`). */
    messages?: ChatMessage[];
    /** Instrução de sistema (contexto) enviada ao modelo. */
    system?: string;
    /** Sobrescreve o provedor configurado nas settings. */
    provider?: AIProvider;
    /** Sobrescreve o modelo configurado nas settings. */
    model?: string;
    /** Máximo de tokens de saída. */
    maxOutputTokens?: number;
    /** Temperatura (geralmente 0-2). */
    temperature?: number;
}

export interface StreamTextOptions extends GenerateTextOptions {
    /** Callback chamado a cada chunk de texto recebido. */
    onChunk?: (chunk: string) => void;
    /** Callback chamado quando o streaming terminar, com o texto completo. */
    onComplete?: (text: string) => void;
}

export interface GenerateTextResult {
    text: string;
    provider: AIProvider;
    model: string;
}

export class MissingAIKeyError extends Error {
    provider: AIProvider;

    constructor(provider: AIProvider) {
        super(`API key not configured for provider: ${provider}`);
        this.name = 'MissingAIKeyError';
        this.provider = provider;
    }
}

// =============================================================================
// SETTINGS CACHE
// =============================================================================

let settingsCache: AISettings | null = null;
let settingsCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

async function getAISettings(): Promise<AISettings> {
    const now = Date.now();

    // Return cached if valid
    if (settingsCache && now - settingsCacheTime < CACHE_TTL) {
        return settingsCache;
    }

    // Default settings
    const defaultSettings: AISettings = {
        provider: 'google',
        model: 'gemini-3-flash-preview',
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
        providerKeys: {
            google: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
            openai: process.env.OPENAI_API_KEY || '',
            anthropic: process.env.ANTHROPIC_API_KEY || '',
        },
    };

    try {
        // Try to load from DB
        const { data: settings } = await supabase.admin
            ?.from('settings')
            .select('key, value')
            .in('key', [
                'ai_provider',
                'ai_model',
                'gemini_api_key',
                'openai_api_key',
                'anthropic_api_key'
            ]) || { data: null };

        if (settings && settings.length > 0) {
            const settingsMap = new Map(settings.map(s => [s.key, s.value as string]));

            const provider = (settingsMap.get('ai_provider') as AIProvider) || defaultSettings.provider;
            const model = settingsMap.get('ai_model') || getDefaultModel(provider)?.id || '';

            const providerKeys: AISettings['providerKeys'] = {
                google: settingsMap.get('gemini_api_key') || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
                openai: settingsMap.get('openai_api_key') || process.env.OPENAI_API_KEY || '',
                anthropic: settingsMap.get('anthropic_api_key') || process.env.ANTHROPIC_API_KEY || '',
            };

            const apiKey = providerKeys[provider] || '';

            settingsCache = { provider, model, apiKey, providerKeys };
        } else {
            settingsCache = defaultSettings;
        }
    } catch (error) {
        console.warn('[AI Service] Failed to load settings from DB, using defaults:', error);
        settingsCache = defaultSettings;
    }

    settingsCacheTime = now;
    return settingsCache;
}

/**
 * Limpa o cache de settings de IA.
 *
 * Deve ser chamado após atualizar as configurações (ex.: via tela de settings)
 * para garantir que a próxima chamada busque os valores mais recentes.
 *
 * @returns Nada.
 */
export function clearSettingsCache() {
    settingsCache = null;
    settingsCacheTime = 0;
}

// =============================================================================
// PROVIDER FACTORY - AI SDK v6 uses direct provider functions
// Dynamic imports for better code splitting
// =============================================================================

const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

interface LanguageModelResult {
    model: ReturnType<typeof import('@ai-sdk/google').createGoogleGenerativeAI> extends (id: string) => infer R ? R : never;
    gatewayEnabled: boolean;
    gatewayConfig?: AiGatewayConfig;
}

async function getLanguageModel(
    providerId: AIProvider,
    modelId: string,
    apiKey: string,
    settings?: AISettings
): Promise<LanguageModelResult> {
    if (!apiKey) {
        throw new MissingAIKeyError(providerId);
    }

    // Verifica se AI Gateway está habilitado
    const gatewayConfig = await getAiGatewayConfig();

    // Gateway requer OIDC token (disponível em Vercel ou via `vercel dev`)
    const oidcToken = process.env.VERCEL_OIDC_TOKEN;
    if (gatewayConfig.enabled) {
        console.log(`[AI Service] VERCEL_OIDC_TOKEN ${oidcToken ? 'present' : 'missing'}`);
    }
    const canUseGateway = gatewayConfig.enabled && oidcToken;

    if (gatewayConfig.enabled && !oidcToken) {
        console.warn('[AI Service] Gateway habilitado mas VERCEL_OIDC_TOKEN não encontrado. Usando conexão direta.');
    }

    if (canUseGateway) {
        // Usa AI Gateway para routing inteligente
        const { createOpenAI } = await import('@ai-sdk/openai');

        const gatewayModelId = toGatewayModelId(providerId, modelId);

        // Headers para o Gateway
        const headers: Record<string, string> = {
            // Token OIDC para autenticação no Gateway
            Authorization: `Bearer ${oidcToken}`,
        };

        // BYOK: passa a chave do provider se configurado
        if (gatewayConfig.useBYOK && apiKey) {
            const byokHeaderMap: Record<AIProvider, string> = {
                google: 'x-google-api-key',
                openai: 'x-openai-api-key',
                anthropic: 'x-anthropic-api-key',
            };
            headers[byokHeaderMap[providerId]] = apiKey;

            // Também adiciona chaves dos outros providers para fallback BYOK
            if (settings?.providerKeys) {
                for (const [prov, key] of Object.entries(settings.providerKeys)) {
                    if (key && prov !== providerId) {
                        headers[byokHeaderMap[prov as AIProvider]] = key;
                    }
                }
            }
        }

        const openai = createOpenAI({
            apiKey: 'dummy', // Não usado, autenticação via OIDC
            baseURL: AI_GATEWAY_BASE_URL,
            headers,
        });

        console.log(`[AI Service] AI Gateway enabled: ${gatewayModelId}`);

        return {
            model: openai(gatewayModelId),
            gatewayEnabled: true,
            gatewayConfig,
        };
    }

    // Fallback: conexão direta
    switch (providerId) {
        case 'google': {
            const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
            return {
                model: createGoogleGenerativeAI({ apiKey })(modelId),
                gatewayEnabled: false,
            };
        }
        case 'openai': {
            const { createOpenAI } = await import('@ai-sdk/openai');
            return {
                model: createOpenAI({ apiKey })(modelId),
                gatewayEnabled: false,
            };
        }
        case 'anthropic': {
            const { createAnthropic } = await import('@ai-sdk/anthropic');
            return {
                model: createAnthropic({ apiKey })(modelId),
                gatewayEnabled: false,
            };
        }
        default:
            throw new Error(`Unknown provider: ${providerId}`);
    }
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Gera texto usando o provedor/modelo configurados (com opção de override).
 *
 * Você pode fornecer `prompt` (simples) ou `messages` (chat). Se ambos forem
 * fornecidos, `messages` tem precedência pela lógica atual.
 *
 * Quando o AI Gateway está habilitado, usa providerOptions.gateway.models
 * para fallbacks automáticos gerenciados pelo Gateway.
 *
 * @param options Opções de geração (prompt/mensagens, system, temperatura, etc.).
 * @returns Objeto com `text` e metadados do provedor/modelo efetivamente usados.
 */
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    const settings = await getAISettings();

    const providerId = options.provider || settings.provider;
    const modelId = options.model || settings.model;

    // Obtém o modelo (pode ser via Gateway ou direto)
    const { model, gatewayEnabled, gatewayConfig } = await getLanguageModel(
        providerId,
        modelId,
        settings.apiKey,
        settings
    );

    console.log(`[AI Service] Generating with ${providerId}/${modelId}${gatewayEnabled ? ' (via Gateway)' : ''}`);

    // Constrói opções base
    const baseOptions: Omit<Parameters<typeof vercelGenerateText>[0], 'prompt' | 'messages'> = {
        model,
        system: options.system,
        temperature: options.temperature ?? 0.7,
        ...(options.maxOutputTokens && { maxOutputTokens: options.maxOutputTokens }),
    };

    // Se Gateway habilitado, adiciona providerOptions para fallbacks automáticos
    if (gatewayEnabled && gatewayConfig?.fallbackModels?.length) {
        baseOptions.providerOptions = {
            gateway: {
                models: gatewayConfig.fallbackModels,
            },
        };
    }

    try {
        const result = options.messages
            ? await vercelGenerateText({ ...baseOptions, messages: options.messages })
            : await vercelGenerateText({ ...baseOptions, prompt: options.prompt || '' });

        return {
            text: result.text,
            provider: providerId,
            model: modelId,
        };
    } catch (error) {
        // Se Gateway habilitado, ele já tentou os fallbacks - não tenta de novo
        if (gatewayEnabled) {
            throw error;
        }

        // Fallback manual (quando Gateway desabilitado)
        const fallback = await getAiFallbackConfig();
        if (!fallback.enabled) {
            throw error;
        }

        const fallbackOrder = (fallback.order || []).filter((provider) => provider !== providerId);
        let lastError: unknown = error;

        for (const provider of fallbackOrder) {
            const fallbackKey = settings.providerKeys?.[provider] || '';
            if (!fallbackKey) {
                continue;
            }

            const fallbackModel = fallback.models?.[provider] || getDefaultModel(provider)?.id || '';
            if (!fallbackModel) {
                continue;
            }

            try {
                console.warn(`[AI Service] Primary failed, falling back to ${provider}/${fallbackModel}`);
                const { model: fallbackModelInstance } = await getLanguageModel(provider, fallbackModel, fallbackKey);

                const fallbackOptions = {
                    model: fallbackModelInstance,
                    system: options.system,
                    temperature: options.temperature ?? 0.7,
                    ...(options.maxOutputTokens && { maxOutputTokens: options.maxOutputTokens }),
                };

                const fallbackResult = options.messages
                    ? await vercelGenerateText({ ...fallbackOptions, messages: options.messages })
                    : await vercelGenerateText({ ...fallbackOptions, prompt: options.prompt || '' });

                return {
                    text: fallbackResult.text,
                    provider,
                    model: fallbackModel,
                };
            } catch (fallbackError) {
                lastError = fallbackError;
            }
        }

        throw lastError;
    }
}

/**
 * Gera texto em streaming usando o provedor/modelo configurados.
 *
 * Durante o streaming, chama `onChunk` para cada pedaço de texto e `onComplete`
 * ao finalizar, além de retornar o texto completo.
 *
 * Quando o AI Gateway está habilitado, usa providerOptions.gateway.models
 * para fallbacks automáticos gerenciados pelo Gateway.
 *
 * @param options Opções de streaming (inclui callbacks opcionais).
 * @returns Objeto com o texto completo e metadados do provedor/modelo.
 */
export async function streamText(options: StreamTextOptions): Promise<GenerateTextResult> {
    const settings = await getAISettings();

    const providerId = options.provider || settings.provider;
    const modelId = options.model || settings.model;

    // Obtém o modelo (pode ser via Gateway ou direto)
    const { model, gatewayEnabled, gatewayConfig } = await getLanguageModel(
        providerId,
        modelId,
        settings.apiKey,
        settings
    );

    console.log(`[AI Service] Streaming with ${providerId}/${modelId}${gatewayEnabled ? ' (via Gateway)' : ''}`);

    // Build call options based on prompt vs messages
    const baseOptions: Omit<Parameters<typeof vercelStreamText>[0], 'prompt' | 'messages'> = {
        model,
        system: options.system,
        temperature: options.temperature ?? 0.7,
        ...(options.maxOutputTokens && { maxOutputTokens: options.maxOutputTokens }),
    };

    // Se Gateway habilitado, adiciona providerOptions para fallbacks automáticos
    if (gatewayEnabled && gatewayConfig?.fallbackModels?.length) {
        baseOptions.providerOptions = {
            gateway: {
                models: gatewayConfig.fallbackModels,
            },
        };
    }

    const result = options.messages
        ? vercelStreamText({ ...baseOptions, messages: options.messages })
        : vercelStreamText({ ...baseOptions, prompt: options.prompt || '' });

    // Collect full text
    let fullText = '';
    for await (const part of result.textStream) {
        fullText += part;
        options.onChunk?.(part);
    }

    options.onComplete?.(fullText);

    return {
        text: fullText,
        provider: providerId,
        model: modelId,
    };
}

/**
 * Gera uma resposta em JSON via IA.
 *
 * Este helper adiciona uma instrução de sistema para pedir **apenas JSON válido**,
 * e em seguida tenta fazer `JSON.parse`, removendo cercas de markdown se aparecerem.
 *
 * @typeParam T Tipo esperado do JSON retornado.
 * @param options Opções de geração (prompt/mensagens e instruções opcionais).
 * @returns Objeto JSON parseado, tipado como `T`.
 * @throws Erro se a resposta não puder ser parseada como JSON.
 */
export async function generateJSON<T = unknown>(options: GenerateTextOptions): Promise<T> {
    const result = await generateText({
        ...options,
        system: (options.system || '') + '\n\nRespond with valid JSON only, no markdown.',
    });

    try {
        // Clean markdown code blocks if present
        const cleanText = result.text
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        // 1) tentativa direta
        try {
            return JSON.parse(cleanText) as T;
        } catch {
            // 2) fallback: às vezes o modelo insiste em adicionar texto antes/depois.
            const extracted = extractFirstJsonValue(cleanText);
            if (extracted) {
                return JSON.parse(extracted) as T;
            }
            throw new Error('AI response was not valid JSON');
        }
    } catch {
        console.error('[AI Service] Failed to parse JSON response:', result.text);
        throw new Error('AI response was not valid JSON');
    }
}

// =============================================================================
// JSON EXTRACTION (fallback)
// =============================================================================

/**
 * Extrai o primeiro valor JSON (objeto/array) encontrado dentro de um texto.
 * Útil quando o modelo retorna algo como: "Aqui está o JSON: {...}".
 */
function extractFirstJsonValue(text: string): string | null {
    const start = Math.min(
        ...['{', '[']
            .map((c) => text.indexOf(c))
            .filter((i) => i >= 0)
    );

    if (!Number.isFinite(start) || start < 0) return null;

    const open = text[start];
    const close = open === '{' ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
        const ch = text[i];

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === open) depth += 1;
        if (ch === close) depth -= 1;

        if (depth === 0) {
            return text.slice(start, i + 1).trim();
        }
    }

    return null;
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

/**
 * Facade (API amigável) para operações de IA.
 *
 * Inclui:
 * - `generateText`: geração simples.
 * - `streamText`: geração em streaming.
 * - `generateJSON`: geração com parse para JSON.
 * - `clearSettingsCache`: invalidação do cache.
 * - `getSettings`: leitura das settings efetivas (com cache).
 */
export const ai = {
    generateText,
    streamText,
    generateJSON,
    clearSettingsCache,
    getSettings: getAISettings,
};

export default ai;

// Re-export types and providers
export { AI_PROVIDERS, getProvider, getModel, getDefaultModel } from './providers';
export type { AIProvider, AIModel, AIProviderConfig } from './providers';
