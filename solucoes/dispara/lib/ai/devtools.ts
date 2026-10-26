/**
 * AI SDK DevTools Integration
 * Middleware para capturar e inspecionar chamadas do AI SDK
 *
 * Uso:
 * 1. Defina AI_DEVTOOLS=1 no ambiente (só funciona em desenvolvimento)
 * 2. Execute: npx @ai-sdk/devtools
 * 3. Acesse: http://localhost:4983
 */

import { wrapLanguageModel, type LanguageModel } from 'ai'

// Flag para habilitar devtools (só em desenvolvimento)
const isDevToolsEnabled =
  process.env.NODE_ENV === 'development' &&
  process.env.AI_DEVTOOLS === '1'

/**
 * Wrapa um modelo com o middleware de DevTools
 * Só ativa quando AI_DEVTOOLS=1 em desenvolvimento
 *
 * @param model - Modelo do AI SDK (Google, OpenAI, etc)
 * @param options - Opções adicionais para o middleware
 * @returns Modelo original (prod) ou wrapped com devtools (dev)
 */
export async function withDevTools<T extends LanguageModel>(
  model: T,
  options?: {
    /** Nome para identificar no DevTools viewer */
    name?: string
  }
): Promise<T> {
  // Em produção ou sem flag, retorna modelo original
  if (!isDevToolsEnabled) {
    return model
  }

  try {
    // Import dinâmico para não quebrar em produção
    const { devToolsMiddleware } = await import('@ai-sdk/devtools')

    console.log('[AI DevTools] 🔧 Middleware ativado -', options?.name || 'model')

    // wrapLanguageModel expects the model type from @ai-sdk/provider
    // We use 'as unknown as T' to handle the type mismatch between AI SDK versions
    return wrapLanguageModel({
      model: model as Parameters<typeof wrapLanguageModel>[0]['model'],
      middleware: devToolsMiddleware(),
    }) as unknown as T
  } catch (error) {
    // Se falhar o import, continua sem devtools
    console.warn('[AI DevTools] ⚠️ Falha ao carregar middleware:', error)
    return model
  }
}

/**
 * Verifica se o DevTools está habilitado
 */
export function isDevToolsActive(): boolean {
  return isDevToolsEnabled
}

/**
 * Instruções para usar o DevTools
 */
export const DEVTOOLS_INSTRUCTIONS = `
╔══════════════════════════════════════════════════════════════╗
║                    AI SDK DevTools                           ║
╠══════════════════════════════════════════════════════════════╣
║  1. Inicie o viewer: npx @ai-sdk/devtools                    ║
║  2. Acesse: http://localhost:4983                            ║
║  3. Execute chamadas de IA no app                            ║
║  4. Inspecione requests, responses, tool calls, tokens       ║
╚══════════════════════════════════════════════════════════════╝
`
