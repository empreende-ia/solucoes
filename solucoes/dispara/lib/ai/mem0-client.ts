/**
 * Mem0 Client - Memória persistente para conversas
 *
 * Integra com Vercel AI SDK usando funções standalone.
 * Graceful degradation: se Mem0 falhar, o sistema continua funcionando.
 *
 * IMPORTANTE: Usamos `getMemories` (não `retrieveMemories`) porque:
 * - `retrieveMemories` retorna string com boilerplate em inglês
 * - `getMemories` retorna array limpo que podemos formatar
 *
 * A API key pode vir de:
 * 1. Supabase (tabela settings) - prioridade
 * 2. process.env.MEM0_API_KEY - fallback
 *
 * @see docs/MEM0_INTEGRATION.md para documentação completa
 */

import { addMemories, getMemories } from '@mem0/vercel-ai-provider'
import { settingsDb } from '@/lib/supabase-db'

// =============================================================================
// Types
// =============================================================================

export interface Mem0Config {
  user_id: string // Telefone do contato (identificador único)
  agent_id?: string // ID do agente AI
  app_id?: string // Identificador da aplicação
}

export interface MemoryContext {
  systemPromptAddition: string // Memórias formatadas para system prompt
  memoryCount: number
}

export interface UserMemory {
  id: string
  memory: string
  created_at?: string
  updated_at?: string
}

export interface UserMemoriesResult {
  memories: UserMemory[]
  count: number
}

interface Mem0Credentials {
  apiKey: string | null
  enabled: boolean
}

interface Mem0Memory {
  id?: string
  memory: string
  hash?: string
  created_at?: string
  updated_at?: string
}

// =============================================================================
// Constants
// =============================================================================

const MEM0_TIMEOUT_MS = 3000 // 3 segundos de timeout
const MEM0_API_BASE = 'https://api.mem0.ai/v1'
const APP_ID = 'dispara'

// Cache em memória (evita bater no banco em toda requisição)
let credentialsCache: Mem0Credentials | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60_000 // 1 minuto

// =============================================================================
// Helpers
// =============================================================================

/**
 * Wrapper para Promise com timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Mem0 timeout after ${ms}ms`)), ms)
    ),
  ])
}

/**
 * Busca credenciais do Mem0 (banco + env fallback)
 * Usa cache em memória para evitar queries frequentes.
 */
async function getMem0Credentials(): Promise<Mem0Credentials> {
  // Verifica cache
  const now = Date.now()
  if (credentialsCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return credentialsCache
  }

  try {
    // Tenta buscar do Supabase
    const [enabledRaw, apiKeyFromDb] = await Promise.all([
      settingsDb.get('mem0_enabled'),
      settingsDb.get('mem0_api_key'),
    ])

    // settingsDb.get retorna string | null, então só precisa comparar com 'true'
    const enabled = enabledRaw === 'true'
    const apiKey = apiKeyFromDb || process.env.MEM0_API_KEY || null

    console.log(`[mem0] Credentials loaded: enabled=${enabled} (raw: ${enabledRaw}, type: ${typeof enabledRaw}), hasApiKey=${!!apiKey}`)

    credentialsCache = { apiKey, enabled }
    cacheTimestamp = now

    return credentialsCache
  } catch (error) {
    // Se falhar ao buscar do banco, usa env var
    console.warn('[mem0] Failed to fetch credentials from DB, using env fallback')
    const apiKey = process.env.MEM0_API_KEY || null
    // Se usando env, considera habilitado se a key existir
    credentialsCache = { apiKey, enabled: !!apiKey }
    cacheTimestamp = now

    return credentialsCache
  }
}

/**
 * Formata array de memórias para texto limpo (sem boilerplate)
 */
function formatMemoriesForPrompt(memories: Mem0Memory[]): string {
  if (!memories || memories.length === 0) {
    return ''
  }

  const memoriesText = memories
    .map((m) => `• ${m.memory}`)
    .join('\n')

  return `
## Contexto do Usuário
Informações relevantes sobre este usuário de conversas anteriores:

${memoriesText}

Use este contexto para personalizar sua resposta quando apropriado.
`.trim()
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Verifica se Mem0 está configurado e habilitado
 * Versão síncrona que usa o cache (pode estar desatualizado)
 */
export function isMem0Enabled(): boolean {
  // Se tem cache, usa
  if (credentialsCache) {
    return credentialsCache.enabled && !!credentialsCache.apiKey
  }
  // Fallback: verifica env var
  return !!process.env.MEM0_API_KEY
}

/**
 * Verifica se Mem0 está configurado e habilitado (versão async, mais precisa)
 */
export async function isMem0EnabledAsync(): Promise<boolean> {
  const creds = await getMem0Credentials()
  return creds.enabled && !!creds.apiKey
}

/**
 * Recupera memórias relevantes para a conversa atual.
 * Retorna texto formatado para adicionar ao system prompt.
 *
 * Usa `getMemories` (não `retrieveMemories`) para ter controle
 * total sobre a formatação, sem boilerplate do SDK.
 *
 * Em caso de erro ou timeout, retorna contexto vazio (graceful degradation).
 */
export async function fetchRelevantMemories(
  query: string,
  config: Mem0Config
): Promise<MemoryContext> {
  const creds = await getMem0Credentials()

  if (!creds.enabled || !creds.apiKey) {
    return { systemPromptAddition: '', memoryCount: 0 }
  }

  const startTime = Date.now()

  try {
    // Busca memórias como array (não string formatada)
    // IMPORTANTE: app_id deve ser passado para filtrar memórias do Dispara
    const memories = await withTimeout(
      getMemories(query, {
        user_id: config.user_id,
        agent_id: config.agent_id,
        app_id: config.app_id || APP_ID,
        mem0ApiKey: creds.apiKey,
      }),
      MEM0_TIMEOUT_MS
    ) as Mem0Memory[] | undefined

    const latency = Date.now() - startTime

    // Verifica se encontrou memórias reais
    if (!memories || memories.length === 0) {
      console.log(`[mem0] No memories found for ${config.user_id} (${latency}ms)`)
      return { systemPromptAddition: '', memoryCount: 0 }
    }

    console.log(`[mem0] Found ${memories.length} memories for ${config.user_id} (${latency}ms)`)

    // Formata manualmente (sem boilerplate do SDK)
    const systemPromptAddition = formatMemoriesForPrompt(memories)

    return { systemPromptAddition, memoryCount: memories.length }
  } catch (error) {
    const latency = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`[mem0] Skipping memories (${latency}ms): ${errorMessage}`)
    return { systemPromptAddition: '', memoryCount: 0 }
  }
}

/**
 * Converte mensagens simples para o formato LanguageModelV2Prompt
 * exigido pelo SDK do Mem0.
 */
function toLanguageModelPrompt(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  return messages.map((m) => ({
    role: m.role,
    content: [{ type: 'text', text: m.content }],
  }))
}

/**
 * Salva a interação atual como memória.
 * Executa em background (fire-and-forget).
 *
 * Não bloqueia a resposta ao usuário.
 */
export async function saveInteractionMemory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  config: Mem0Config
): Promise<boolean> {
  const creds = await getMem0Credentials()

  if (!creds.enabled || !creds.apiKey) {
    return false
  }

  try {
    // Converte para formato LanguageModelV2Prompt
    const formattedMessages = toLanguageModelPrompt(messages)

    await withTimeout(
      addMemories(formattedMessages, {
        user_id: config.user_id,
        agent_id: config.agent_id,
        app_id: config.app_id || APP_ID,
        mem0ApiKey: creds.apiKey,
      }),
      MEM0_TIMEOUT_MS
    )

    console.log(`[mem0] Saved interaction for ${config.user_id}`)
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`[mem0] Failed to save memory: ${errorMessage}`)
    return false
  }
}

/**
 * Busca todas as memórias de um usuário.
 * Útil para mostrar contexto a atendentes humanos.
 *
 * Usa a API REST do Mem0 diretamente (o SDK Vercel AI não expõe essa função).
 */
export async function getAllUserMemories(userId: string): Promise<UserMemoriesResult> {
  const creds = await getMem0Credentials()

  if (!creds.enabled || !creds.apiKey) {
    return { memories: [], count: 0 }
  }

  try {
    // Usa POST /v2/memories/ com filtros (app_id é obrigatório pois salvamos com ele)
    const url = `${MEM0_API_BASE.replace('/v1', '/v2')}/memories/`
    const body = {
      filters: {
        AND: [
          { user_id: userId },
          { app_id: APP_ID },
        ],
      },
    }

    const response = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${creds.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      MEM0_TIMEOUT_MS * 2
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[mem0] getAllUserMemories error: ${response.status} - ${errorText}`)
      throw new Error(`Mem0 API error: ${response.status}`)
    }

    // v2 retorna array diretamente
    const rawMemories = await response.json()
    const memories = (Array.isArray(rawMemories) ? rawMemories : []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      memory: m.memory as string,
      created_at: m.created_at as string | undefined,
      updated_at: m.updated_at as string | undefined,
    }))

    console.log(`[mem0] Retrieved ${memories.length} memories for ${userId}`)
    return { memories, count: memories.length }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`[mem0] Failed to get all memories: ${errorMessage}`)
    return { memories: [], count: 0 }
  }
}

/**
 * Deleta uma memória específica por ID.
 */
export async function deleteMemoryById(memoryId: string): Promise<boolean> {
  const creds = await getMem0Credentials()

  if (!creds.enabled || !creds.apiKey) {
    return false
  }

  try {
    const response = await withTimeout(
      fetch(`${MEM0_API_BASE}/memories/${memoryId}/`, {
        method: 'DELETE',
        headers: {
          Authorization: `Token ${creds.apiKey}`,
        },
      }),
      MEM0_TIMEOUT_MS
    )

    if (!response.ok) {
      throw new Error(`Mem0 API error: ${response.status}`)
    }

    console.log(`[mem0] Deleted memory ${memoryId}`)
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`[mem0] Failed to delete memory: ${errorMessage}`)
    return false
  }
}

/**
 * Deleta todas as memórias de um usuário.
 * Usado para compliance com LGPD (direito ao esquecimento).
 *
 * Usa a API REST do Mem0 diretamente.
 */
export async function deleteUserMemories(userId: string): Promise<{ success: boolean; deletedCount: number }> {
  const creds = await getMem0Credentials()

  if (!creds.enabled || !creds.apiKey) {
    return { success: false, deletedCount: 0 }
  }

  try {
    const response = await withTimeout(
      fetch(`${MEM0_API_BASE}/memories/?user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Token ${creds.apiKey}`,
          'Content-Type': 'application/json',
        },
      }),
      MEM0_TIMEOUT_MS * 2
    )

    if (!response.ok) {
      throw new Error(`Mem0 API error: ${response.status}`)
    }

    const data = await response.json()
    const deletedCount = data.deleted_count || 0

    console.log(`[mem0] Deleted ${deletedCount} memories for ${userId}`)
    return { success: true, deletedCount }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`[mem0] Failed to delete memories: ${errorMessage}`)
    return { success: false, deletedCount: 0 }
  }
}

/**
 * Limpa o cache de credenciais.
 * Útil para forçar a releitura após mudanças nas configurações.
 */
export function clearMem0Cache(): void {
  credentialsCache = null
  cacheTimestamp = 0
}
