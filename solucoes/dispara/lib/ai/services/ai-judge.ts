import { generateObject } from 'ai'
import { JudgmentSchema, type Judgment } from '../schemas/template-schemas'
import { buildUtilityJudgePrompt } from '../prompts/utility-judge'
import { getAiPromptsConfig } from '../ai-center-config'
import { getProviderFromModel, type AIProvider } from '../provider-factory'
import { DEFAULT_MODEL_ID } from '../model'

// ============================================================================
// AI JUDGE SERVICE
// Usa LLM para analisar se template será aprovado como UTILITY pela Meta
// Suporta Google (Gemini), OpenAI (GPT), Anthropic (Claude)
// ============================================================================

export interface JudgeOptions {
    apiKey: string
    model?: string
}

/**
 * Cria um modelo de linguagem baseado no provider detectado
 */
async function createModelFromProvider(modelId: string, apiKey: string, provider: AIProvider) {
    switch (provider) {
        case 'google': {
            const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
            return createGoogleGenerativeAI({ apiKey })(modelId)
        }
        case 'openai': {
            const { createOpenAI } = await import('@ai-sdk/openai')
            return createOpenAI({ apiKey })(modelId)
        }
        case 'anthropic': {
            const { createAnthropic } = await import('@ai-sdk/anthropic')
            return createAnthropic({ apiKey })(modelId)
        }
        default:
            throw new Error(`Provider não suportado: ${provider}`)
    }
}

/**
 * Analisa um template usando IA para prever se será aprovado como UTILITY
 */
export async function judgeTemplate(
    template: { name?: string; header: string | null; body: string },
    options: JudgeOptions,
    promptTemplate?: string
): Promise<Judgment> {
    const modelId = options.model || DEFAULT_MODEL_ID
    const provider = getProviderFromModel(modelId)
    const model = await createModelFromProvider(modelId, options.apiKey, provider)

    console.log(`[AI_JUDGE] Using provider: ${provider}, model: ${modelId}`)

    const prompt = buildUtilityJudgePrompt(template.header, template.body, promptTemplate)
    const templateName = template.name || 'unknown'

    console.log(`[AI_JUDGE] Analyzing: ${templateName}`)

    const { object: judgment } = await generateObject({
        model,
        schema: JudgmentSchema,
        prompt
    })

    const status = judgment.approved ? '✅ APPROVED' : '❌ REJECTED'
    console.log(`[AI_JUDGE] ${templateName}: ${status} as ${judgment.predictedCategory} (${Math.round(judgment.confidence * 100)}%)`)

    if (judgment.issues.length > 0) {
        console.log(`[AI_JUDGE] ${templateName} issues: ${judgment.issues.map(i => i.word).join(', ')}`)
    }

    if (judgment.fixedBody) {
        console.log(`[AI_JUDGE] ${templateName}: Fixed body provided`)
    }

    return judgment
}

/**
 * Analisa múltiplos templates em paralelo
 */
export async function judgeTemplates(
    templates: Array<{ name?: string; header: string | null; body: string }>,
    options: JudgeOptions
): Promise<Judgment[]> {
    console.log(`[AI_JUDGE] Analyzing ${templates.length} templates...`)

    const promptsConfig = await getAiPromptsConfig()

    const judgments = await Promise.all(
        templates.map(t => judgeTemplate(t, options, promptsConfig.utilityJudgeTemplate))
    )

    const approved = judgments.filter(j => j.approved).length
    const fixed = judgments.filter(j => j.fixedBody).length
    const rejected = judgments.filter(j => !j.approved && !j.fixedBody).length

    console.log(`[AI_JUDGE] Summary: ${approved} approved, ${fixed} fixed, ${rejected} rejected (total: ${templates.length})`)

    return judgments
}
