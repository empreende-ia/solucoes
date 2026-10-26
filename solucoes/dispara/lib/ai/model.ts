/**
 * AI Model Configuration
 * Model definitions and schemas for AI agents
 */

import { z } from 'zod'

// =============================================================================
// Model Configuration Schema
// =============================================================================

/**
 * Schema for AI agent call options
 * Used to configure individual agent invocations
 */
export const callOptionsSchema = z.object({
  /** Maximum tokens in the response */
  maxTokens: z.number().int().positive().max(8192).default(2048),
  /** Temperature for response randomness (0-2) */
  temperature: z.number().min(0).max(2).default(0.7),
  /** Top-p sampling parameter */
  topP: z.number().min(0).max(1).optional(),
  /** Stop sequences to end generation */
  stopSequences: z.array(z.string()).optional(),
})

export type CallOptions = z.infer<typeof callOptionsSchema>

// =============================================================================
// Default Model
// =============================================================================

/**
 * Default model for AI agents
 */
export const DEFAULT_MODEL_ID = 'gemini-3-flash-preview'

// Re-export from providers.ts - single source of truth for models
export { AI_PROVIDERS, getProvider, getModel, getDefaultModel } from './providers'
export type { AIProvider, AIModel, AIProviderConfig } from './providers'

// =============================================================================
// Response Schema
// =============================================================================

/**
 * Schema for structured AI responses
 * Ensures consistent response format from the agent
 */
export const supportResponseSchema = z.object({
  /** The response message to send to the user */
  message: z.string().describe('A resposta para enviar ao usuário'),
  /** Sentiment detected in user message */
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'frustrated'])
    .describe('Sentimento detectado na mensagem do usuário'),
  /** Confidence level in the response (0-1) */
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Nível de confiança na resposta (0 = incerto, 1 = certo)'),
  /** Whether the agent should hand off to a human */
  shouldHandoff: z
    .boolean()
    .describe('Se deve transferir para um atendente humano'),
  /** Reason for handoff if shouldHandoff is true */
  handoffReason: z
    .string()
    .optional()
    .describe('Motivo da transferência para humano'),
  /** Summary of the conversation for handoff */
  handoffSummary: z
    .string()
    .optional()
    .describe('Resumo da conversa para o atendente'),
  /** Sources used to generate the response */
  sources: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
      })
    )
    .optional()
    .describe('Fontes utilizadas para gerar a resposta'),
})

export type SupportResponse = z.infer<typeof supportResponseSchema>

// =============================================================================
// Default Call Options
// =============================================================================

export const DEFAULT_CALL_OPTIONS: CallOptions = {
  maxTokens: 2048,
  temperature: 0.7,
}
