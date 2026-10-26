import { tool } from 'ai'
import { z } from 'zod'

// ============================================================================
// LISTA DE PALAVRAS/FRASES QUE ATIVAM MARKETING NA META
// Baseado em pesquisa oficial: Reddit, Infobip, eGrow, Meta Docs
// ============================================================================

export const PROHIBITED_WORDS = {
    // Escassez
    scarcity: [
        'exclusivo', 'exclusiva', 'exclusivos', 'exclusivas',
        'limitado', 'limitada', 'limitados', 'limitadas',
        'apenas', 'apenas x', 'restam', 'restam apenas',
        'últimas', 'últimos', 'última', 'último',
        'poucas', 'poucos', 'raras', 'raros',
        'vagas remanescentes', 'últimas vagas', 'poucas vagas'
    ],

    // Urgência
    urgency: [
        'só hoje', 'somente hoje', 'apenas hoje',
        'não perca', 'nao perca',
        'corra', 'apressa', 'rápido',
        'última chance', 'ultima chance',
        'tempo limitado', 'por tempo limitado',
        'acaba em', 'termina hoje', 'expira'
    ],

    // Promocional
    promotional: [
        'oferta', 'ofertas',
        'desconto', 'descontos', '% off',
        'grátis', 'gratis', 'gratuito', 'gratuita',
        'especial', 'especiais',
        'promoção', 'promocao', 'promo',
        'bônus', 'bonus', 'brinde',
        'formas de pagamento'
    ],

    // CTA Agressivo
    aggressiveCTA: [
        'garanta já', 'garanta agora', 'garanta sua',
        'aproveite agora', 'aproveite já', 'aproveite essa',
        'compre agora', 'compre já',
        'reserve já', 'reserve agora',
        'aja agora', 'não espere'
    ],

    // Botões Promocionais
    promotionalButtons: [
        'garantir vaga', 'garantir acesso',
        'aproveitar oferta', 'aproveitar',
        'comprar agora', 'pegar desconto',
        'quero acesso', 'quero agora'
    ]
} as const

// Flatten all words into a single array
export const ALL_PROHIBITED_WORDS = Object.values(PROHIBITED_WORDS).flat()

// ============================================================================
// TOOL DE VALIDAÇÃO UTILITY
// ============================================================================

export interface ValidationResult {
    valid: boolean
    issues: Array<{
        word: string
        category: string
        position: number
    }>
    suggestion: string | null
}

/**
 * Verifica se um texto contém palavras que ativam MARKETING na Meta
 */
export function checkProhibitedWords(text: string): ValidationResult {
    const lowerText = text.toLowerCase()
    const issues: ValidationResult['issues'] = []

    for (const [category, words] of Object.entries(PROHIBITED_WORDS)) {
        for (const word of words) {
            const position = lowerText.indexOf(word.toLowerCase())
            if (position !== -1) {
                issues.push({ word, category, position })
            }
        }
    }

    return {
        valid: issues.length === 0,
        issues,
        suggestion: issues.length > 0
            ? `Remova ou substitua: ${issues.map(i => `"${i.word}"`).join(', ')}`
            : null
    }
}

/**
 * Tool para validar se template passa como UTILITY
 * Pode ser usado em ToolLoopAgent
 */
export const validateUtilityTool = tool({
    description: 'Valida se um template WhatsApp passa como UTILITY na Meta. Retorna issues se encontrar palavras promocionais.',
    inputSchema: z.object({
        body: z.string().describe('Texto do body do template'),
        header: z.string().nullable().describe('Texto do header ou null')
    }),
    execute: async ({ body, header }) => {
        const fullText = `${header || ''} ${body}`
        const result = checkProhibitedWords(fullText)

        console.log(`[VALIDATE] ${result.valid ? '✅' : '❌'} ${result.issues.length} issues found`)

        return result
    }
})

/**
 * Tool para corrigir posição de variáveis
 */
export const fixVariablesTool = tool({
    description: 'Corrige texto que começa ou termina com variáveis {{X}}',
    inputSchema: z.object({
        text: z.string().describe('Texto a corrigir')
    }),
    execute: async ({ text }) => {
        let fixed = text
        let wasFixed = false

        // Check if starts with variable
        if (/^\s*\{\{\d+\}\}/.test(fixed)) {
            fixed = 'Olá! ' + fixed.replace(/^\s*/, '')
            wasFixed = true
        }

        // Check if ends with variable
        if (/\{\{\d+\}\}[h]?\s*[.!?]?\s*$/.test(fixed)) {
            fixed = fixed.replace(/\s*[.!?]?\s*$/, '. Aguardamos seu retorno.')
            wasFixed = true
        }

        return { fixed, wasFixed }
    }
})
