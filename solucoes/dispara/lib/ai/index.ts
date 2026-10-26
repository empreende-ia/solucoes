/**
 * AI Service - Main Export
 * 
 * Usage:
 *   import { ai } from '@/lib/ai';
 *   const result = await ai.generateText({ prompt: 'Hello' });
 */

export {
    ai,
    generateText,
    streamText,
    generateJSON,
    clearSettingsCache,
    MissingAIKeyError,
    type AISettings,
    type GenerateTextOptions,
    type StreamTextOptions,
    type GenerateTextResult,
    type ChatMessage,
} from './unified-ai-service';

export {
    AI_PROVIDERS,
    getProvider,
    getModel,
    getDefaultModel,
} from './providers';

export type {
    AIProvider,
    AIModel,
    AIProviderConfig,
} from './providers';
