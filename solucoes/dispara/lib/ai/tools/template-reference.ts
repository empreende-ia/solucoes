import fs from 'fs'
import path from 'path'
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '../services/template-agent'

// ============================================================================
// TEMPLATE REFERENCE FUNCTIONS
// Funções helper para buscar templates e regras por categoria
// ============================================================================

// Re-export for convenience
export { TEMPLATE_CATEGORIES, type TemplateCategory }

// Load the guidelines document
const GUIDELINES_PATH = path.join(process.cwd(), 'docs', 'utility-template-guidelines.md')

let guidelinesCache: string | null = null

function loadGuidelines(): string {
    if (!guidelinesCache) {
        try {
            guidelinesCache = fs.readFileSync(GUIDELINES_PATH, 'utf-8')
        } catch {
            console.error('[TEMPLATE_REF] Could not load guidelines document')
            guidelinesCache = ''
        }
    }
    return guidelinesCache
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Lista todas as categorias disponíveis
 */
export function listCategories() {
    return Object.entries(TEMPLATE_CATEGORIES).map(([key, value]) => ({
        id: key as TemplateCategory,
        name: value.name,
        keywords: [...value.keywords],
        exampleCount: value.examples.length
    }))
}

/**
 * Busca templates por categoria
 */
export function getTemplatesByCategory(category: TemplateCategory) {
    const categoryData = TEMPLATE_CATEGORIES[category]

    if (!categoryData) {
        return null
    }

    return {
        category: categoryData.name,
        templates: categoryData.examples,
        tips: [
            'Use variáveis {{1}}, {{2}}, etc. para conteúdo dinâmico',
            'Nunca inicie ou termine o texto com variável',
            'Mantenha tom informativo, nunca promocional',
            'Botões devem ser neutros como "Ver detalhes" ou "Acompanhar"'
        ]
    }
}

/**
 * Detecta categoria automaticamente baseado no prompt
 */
export function detectCategory(userPrompt: string): {
    suggestedCategory: TemplateCategory
    confidence: number
    matchedKeywords: string[]
    alternatives: TemplateCategory[]
} {
    const lowerPrompt = userPrompt.toLowerCase()
    const scores: Array<{ category: TemplateCategory; score: number; matches: string[] }> = []

    for (const [categoryKey, categoryData] of Object.entries(TEMPLATE_CATEGORIES)) {
        const matches = categoryData.keywords.filter(kw => lowerPrompt.includes(kw))
        if (matches.length > 0) {
            scores.push({
                category: categoryKey as TemplateCategory,
                score: matches.length,
                matches
            })
        }
    }

    scores.sort((a, b) => b.score - a.score)

    const suggested = scores[0] || null
    const alternatives = scores.slice(1, 3)

    return {
        suggestedCategory: suggested?.category || 'eventos',
        confidence: suggested ? Math.min(suggested.score / 3, 1) : 0.5,
        matchedKeywords: suggested?.matches || [],
        alternatives: alternatives.map(a => a.category)
    }
}

/**
 * Obtém as regras de validação
 */
export function getValidationRules() {
    return {
        prohibitedWords: {
            scarcity: ['exclusivo', 'limitado', 'apenas', 'restam', 'últimas', 'poucas', 'vagas remanescentes'],
            urgency: ['só hoje', 'não perca', 'corra', 'última chance', 'tempo limitado', 'acaba em'],
            promotional: ['oferta', 'desconto', 'grátis', 'especial', 'promoção', 'bônus', 'brinde'],
            aggressiveCTA: ['garanta já', 'aproveite agora', 'compre agora', 'reserve já']
        },
        technicalRules: {
            variableFormat: '{{1}}, {{2}}, {{3}} - sequencial',
            headerMaxChars: 60,
            bodyMaxChars: 1024,
            footerMaxChars: 60,
            buttonMaxChars: 25,
            minVariables: 2,
            noVariableAtStart: true,
            noVariableAtEnd: true
        },
        approvedPhrases: {
            openings: ['Olá, {{1}},', 'Oi, {{1}},', 'Este é um lembrete', 'Obrigado por'],
            closings: ['Atenciosamente,', 'Obrigado.', 'Aguardamos seu retorno.'],
            buttons: ['Ver detalhes', 'Ver pedido', 'Rastrear', 'Confirmar', 'Reagendar', 'Acompanhar']
        }
    }
}

/**
 * Obtém o documento completo de guidelines
 */
export function getFullGuidelines() {
    const guidelines = loadGuidelines()
    return { guidelines, length: guidelines.length }
}

// Export all functions as a collection
export const templateReferenceFunctions = {
    listCategories,
    getTemplatesByCategory,
    detectCategory,
    getValidationRules,
    getFullGuidelines
}
