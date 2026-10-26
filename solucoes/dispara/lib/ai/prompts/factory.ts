import { MARKETING_PROMPT } from './marketing';
import { UTILITY_PROMPT } from './utility';
import { BYPASS_PROMPT } from './bypass';

export type AIStrategy = 'marketing' | 'utility' | 'bypass';

// Tipo para prompts customizados vindos do banco de dados
export type CustomStrategyPrompts = {
    strategyMarketing?: string;
    strategyUtility?: string;
    strategyBypass?: string;
};

// Defaults hardcoded (fallback quando não há config no banco)
const DEFAULT_STRATEGY_PROMPTS: Record<AIStrategy, string> = {
    marketing: MARKETING_PROMPT,
    utility: UTILITY_PROMPT,
    bypass: BYPASS_PROMPT,
};

export class PromptFactory {
    /**
     * Retorna o prompt do sistema para a estratégia especificada.
     * Se customPrompts for fornecido, usa os valores do banco de dados.
     * Caso contrário, usa os defaults hardcoded.
     */
    static getSystemPrompt(strategy: AIStrategy, customPrompts?: CustomStrategyPrompts): string {
        // Mapeia strategy para a key correspondente nos customPrompts
        const keyMap: Record<AIStrategy, keyof CustomStrategyPrompts> = {
            marketing: 'strategyMarketing',
            utility: 'strategyUtility',
            bypass: 'strategyBypass',
        };

        const customKey = keyMap[strategy];
        const customValue = customPrompts?.[customKey];

        // Usa custom se existir e não estiver vazio, senão usa default
        if (customValue && customValue.trim().length > 0) {
            return customValue;
        }

        return DEFAULT_STRATEGY_PROMPTS[strategy] ?? DEFAULT_STRATEGY_PROMPTS.bypass;
    }

    /**
     * Retorna a categoria Meta para a estratégia.
     */
    static getCategoryHint(strategy: AIStrategy): string {
        if (strategy === 'marketing') return 'MARKETING';
        return 'UTILITY';
    }

    /**
     * Retorna os prompts default (para inicialização/fallback).
     */
    static getDefaultPrompts(): Record<AIStrategy, string> {
        return { ...DEFAULT_STRATEGY_PROMPTS };
    }
}
