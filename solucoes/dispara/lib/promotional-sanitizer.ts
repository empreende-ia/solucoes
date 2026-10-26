/**
 * Promotional Word Sanitizer for WhatsApp Templates
 * 
 * Converts marketing-style content into UTILITY-approved templates
 * by replacing promotional words/phrases with variables.
 * 
 * The template structure is neutral → approved as UTILITY
 * The variables contain promotional values → engagement preserved
 */

// Patterns to detect and replace with variables
// Ordered by priority (more specific patterns first)
const PROMOTIONAL_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
    category: 'urgency' | 'scarcity' | 'offer' | 'action' | 'promo';
}> = [
        // Scarcity patterns (specific quantities)
        { pattern: /apenas\s+(\d+)\s+vagas?/gi, description: 'quantidade de vagas', category: 'scarcity' },
        { pattern: /(\d+)\s+vagas?\s+(limitadas?|disponíveis?)/gi, description: 'vagas limitadas', category: 'scarcity' },
        { pattern: /somente\s+(\d+)/gi, description: 'quantidade limitada', category: 'scarcity' },
        { pattern: /restam\s+(\d+)/gi, description: 'quantidade restante', category: 'scarcity' },

        // Urgency patterns (date/time specific)
        { pattern: /nesta\s+(segunda|terça|quarta|quinta|sexta|sábado|domingo)[-\s]feira/gi, description: 'dia da semana', category: 'urgency' },
        { pattern: /às\s+(\d{1,2}[h:]\d{0,2})/gi, description: 'horário', category: 'urgency' },
        { pattern: /dia\s+(\d{1,2}\/\d{1,2})/gi, description: 'data', category: 'urgency' },
        { pattern: /\((\d{1,2}\/\d{1,2})\)/gi, description: 'data entre parênteses', category: 'urgency' },

        // Offer patterns
        { pattern: /boleto\s+parcelado/gi, description: 'forma de pagamento', category: 'offer' },
        { pattern: /(\d+)x\s+sem\s+juros/gi, description: 'parcelamento', category: 'offer' },
        { pattern: /desconto\s+de\s+(\d+%?)/gi, description: 'valor do desconto', category: 'offer' },
        { pattern: /preço\s+especial/gi, description: 'condição especial', category: 'offer' },

        // Action words (single words that trigger marketing classification)
        { pattern: /\b(oportunidade|oportunidades)\b/gi, description: 'oportunidade', category: 'promo' },
        { pattern: /\b(vagas?)\b/gi, description: 'vaga', category: 'promo' },
        { pattern: /\b(exclusivo|exclusiva|exclusivas|exclusivos)\b/gi, description: 'exclusividade', category: 'promo' },
        { pattern: /\b(limitado|limitada|limitadas|limitados)\b/gi, description: 'limitação', category: 'promo' },
        { pattern: /\b(imperdível|imperdíveis)\b/gi, description: 'destaque', category: 'promo' },

        // CTA words
        { pattern: /\b(garanta|garantir)\b/gi, description: 'ação de garantia', category: 'action' },
        { pattern: /\b(aproveite|aproveitar)\b/gi, description: 'ação de aproveitamento', category: 'action' },
        { pattern: /\b(corra|correr)\b/gi, description: 'urgência de ação', category: 'action' },
        { pattern: /não\s+perca/gi, description: 'alerta de perda', category: 'action' },
    ];

export interface SanitizedTemplate {
    /** The sanitized template with variables {{1}}, {{2}}, etc. */
    sanitizedContent: string;
    /** The original content before sanitization */
    originalContent: string;
    /** Map of variable number to the promotional value it replaced */
    variableMap: Map<number, { value: string; description: string; category: string }>;
    /** Array of variables for Meta API example values */
    exampleValues: string[];
    /** Number of promotional patterns found and replaced */
    replacementCount: number;
    /** Whether the template was modified */
    wasModified: boolean;
}

/**
 * Sanitizes promotional content by replacing marketing words with variables.
 * 
 * @example
 * Input: "Apenas 23 vagas disponíveis! Garanta a sua nesta quarta-feira às 09h!"
 * Output: "{{1}} disponíveis! {{2}} a sua {{3}} às {{4}}!"
 * Variables: { 1: "Apenas 23 vagas", 2: "Garanta", 3: "nesta quarta-feira", 4: "09h" }
 */
export function sanitizePromotionalContent(content: string): SanitizedTemplate {
    const variableMap = new Map<number, { value: string; description: string; category: string }>();
    let variableCounter = 1;
    let sanitizedContent = content;
    let wasModified = false;

    // Track which parts we've already replaced to avoid overlapping
    const replacedRanges: Array<{ start: number; end: number }> = [];

    for (const { pattern, description, category } of PROMOTIONAL_PATTERNS) {
        // Reset pattern lastIndex for global patterns
        pattern.lastIndex = 0;

        // Find all matches
        let match: RegExpExecArray | null;
        const matches: Array<{ fullMatch: string; index: number }> = [];

        while ((match = pattern.exec(sanitizedContent)) !== null) {
            matches.push({ fullMatch: match[0], index: match.index });
        }

        // Replace from end to start to preserve indices
        for (const { fullMatch, index } of matches.reverse()) {
            // Check if this range overlaps with already replaced content
            const wouldOverlap = replacedRanges.some(range =>
                (index >= range.start && index < range.end) ||
                (index + fullMatch.length > range.start && index + fullMatch.length <= range.end)
            );

            if (wouldOverlap) continue;

            // Check if this is already a variable
            if (/\{\{\d+\}\}/.test(fullMatch)) continue;

            // Replace with variable
            const variableKey = `{{${variableCounter}}}`;
            sanitizedContent =
                sanitizedContent.substring(0, index) +
                variableKey +
                sanitizedContent.substring(index + fullMatch.length);

            variableMap.set(variableCounter, {
                value: fullMatch.trim(),
                description,
                category
            });

            replacedRanges.push({
                start: index,
                end: index + variableKey.length
            });

            variableCounter++;
            wasModified = true;
        }
    }

    // Generate example values for Meta API
    const exampleValues: string[] = [];
    for (let i = 1; i < variableCounter; i++) {
        const variable = variableMap.get(i);
        exampleValues.push(variable ? `Exemplo ${i}` : `Exemplo ${i}`);
    }

    return {
        sanitizedContent,
        originalContent: content,
        variableMap,
        exampleValues,
        replacementCount: variableCounter - 1,
        wasModified
    };
}

/**
 * Reconstructs the original message by filling variables with their values.
 * This is what gets sent to the user (after template is approved).
 */
export function reconstructMessage(
    sanitizedContent: string,
    variableMap: Map<number, { value: string; description: string; category: string }>
): string {
    let message = sanitizedContent;

    variableMap.forEach(({ value }, key) => {
        message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });

    return message;
}

/**
 * Generates a neutral wrapper around promotional content.
 * This transforms aggressive marketing into an "update notification" style.
 */
export function wrapAsUpdateNotification(
    content: string,
    updateType: 'status' | 'reminder' | 'info' = 'info'
): string {
    const prefixes = {
        status: 'Atualização de status:',
        reminder: 'Lembrete:',
        info: 'Informação importante:'
    };

    const suffixes = {
        status: 'Para mais detalhes, acesse o link.',
        reminder: 'Responda CONFIRMAR para confirmar ou CANCELAR para cancelar.',
        info: 'Caso não tenha solicitado, ignore esta mensagem.'
    };

    const sanitized = sanitizePromotionalContent(content);

    return `${prefixes[updateType]} ${sanitized.sanitizedContent} ${suffixes[updateType]}`;
}

// For debugging
export function analyzeContent(content: string): void {
    console.log('=== Análise de Conteúdo Promocional ===');
    console.log('Original:', content);
    console.log('');

    const result = sanitizePromotionalContent(content);

    console.log('Sanitizado:', result.sanitizedContent);
    console.log('');
    console.log('Variáveis encontradas:', result.replacementCount);

    result.variableMap.forEach((info, key) => {
        console.log(`  {{${key}}} = "${info.value}" (${info.category}: ${info.description})`);
    });

    console.log('');
    console.log('Reconstruído:', reconstructMessage(result.sanitizedContent, result.variableMap));
}
