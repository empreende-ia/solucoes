import { z } from 'zod'

// ============================================================================
// SCHEMAS PARA GERAÇÃO DE TEMPLATES WHATSAPP
// ============================================================================

/**
 * Schema para template gerado pela IA
 */
export const GeneratedTemplateSchema = z.object({
    name: z.string().describe('Nome do template em snake_case'),
    header: z.string().nullable().describe('Texto do header (máx 60 chars) ou null'),
    body: z.string().describe('Texto do body (máx 1024 chars)'),
    footer: z.string().describe('Texto do footer'),
    button: z.string().describe('Texto do botão (máx 25 chars)')
})

export type GeneratedTemplate = z.infer<typeof GeneratedTemplateSchema>

/**
 * Issue encontrada na validação do template
 */
export const IssueSchema = z.object({
    word: z.string().describe('Palavra ou frase problemática'),
    reason: z.string().describe('Por que essa palavra ativa MARKETING'),
    suggestion: z.string().describe('Sugestão de substituição')
})

export type Issue = z.infer<typeof IssueSchema>

/**
 * Resultado do julgamento do AI Judge
 */
export const JudgmentSchema = z.object({
    approved: z.boolean().describe('true se o template passa como UTILITY'),
    predictedCategory: z.enum(['UTILITY', 'MARKETING']).describe('Categoria prevista pela Meta'),
    confidence: z.number().min(0).max(1).describe('Confiança na previsão (0-1)'),
    issues: z.array(IssueSchema).describe('Lista de problemas encontrados'),
    fixedBody: z.string().optional().describe('Versão corrigida do body se houver issues'),
    fixedHeader: z.string().nullable().optional().describe('Versão corrigida do header se houver issues')
})

export type Judgment = z.infer<typeof JudgmentSchema>

/**
 * Template com resultado do julgamento
 */
export const JudgedTemplateSchema = GeneratedTemplateSchema.extend({
    judgment: JudgmentSchema,
    wasFixed: z.boolean().default(false)
})

export type JudgedTemplate = z.infer<typeof JudgedTemplateSchema>
