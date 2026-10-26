/**
 * WhatsApp Business Platform Pricing Calculator
 * Based on Meta's official pricing for Brazil (October 2025)
 * Source: https://developers.facebook.com/docs/whatsapp/pricing
 */

export type TemplateCategory = 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO' | 'AUTHENTICATION' | 'UTILITY';

// Map Meta API categories to our internal format
type InternalCategory = 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO';

const normalizeCategory = (category: string): InternalCategory => {
    const upperCategory = category.toUpperCase();
    // Meta API format
    if (upperCategory === 'AUTHENTICATION') return 'AUTENTICACAO';
    if (upperCategory === 'UTILITY') return 'UTILIDADE';
    // Already canonical format (from canonicalTemplateCategory)
    if (upperCategory === 'AUTENTICACAO') return 'AUTENTICACAO';
    if (upperCategory === 'UTILIDADE') return 'UTILIDADE';
    if (upperCategory === 'MARKETING') return 'MARKETING';
    return 'MARKETING'; // Default fallback
};

// Pricing per message in USD for Brazil
const BRAZIL_PRICING: Record<'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO', number> = {
    MARKETING: 0.0825,      // Marketing messages
    UTILIDADE: 0.0068,      // Utility messages  
    AUTENTICACAO: 0.0068,   // Authentication messages (international)
};

// Volume tier discounts (monthly)
interface VolumeTier {
    from: number;
    to: number;
    discountPercent: number;
}

const MARKETING_TIERS: VolumeTier[] = [
    { from: 0, to: 1000, discountPercent: 0 },
    { from: 1001, to: 10000, discountPercent: -3 },
    { from: 10001, to: 100000, discountPercent: -10 },
    { from: 100001, to: Infinity, discountPercent: -25 },
];

const UTILITY_AUTH_TIERS: VolumeTier[] = [
    { from: 0, to: 1000, discountPercent: 0 },
    { from: 1001, to: 10000, discountPercent: 0 },
    { from: 10001, to: 100000, discountPercent: -5 },
    { from: 100001, to: Infinity, discountPercent: -20 },
];

/**
 * Calculate the effective price per message based on volume
 */
export function calculateEffectivePrice(
    category: TemplateCategory,
    monthlyVolume: number
): number {
    const normalizedCategory = normalizeCategory(category);
    const basePrice = BRAZIL_PRICING[normalizedCategory];
    const tiers = normalizedCategory === 'MARKETING' ? MARKETING_TIERS : UTILITY_AUTH_TIERS;

    const tier = tiers.find(t => monthlyVolume >= t.from && monthlyVolume <= t.to);
    if (!tier) return basePrice;

    const discount = 1 + (tier.discountPercent / 100);
    return basePrice * discount;
}

/**
 * Calculate total cost for a campaign in USD
 */
export function calculateCampaignCost(
    category: TemplateCategory,
    recipients: number,
    monthlyVolume: number = 0
): number {
    const pricePerMessage = calculateEffectivePrice(category, monthlyVolume);
    return recipients * pricePerMessage;
}

/**
 * Convert USD to BRL
 */
export function usdToBrl(usd: number, exchangeRate: number = 5.00): number {
    return usd * exchangeRate;
}

/**
 * Format price as BRL currency string
 */
export function formatBRL(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/**
 * Get pricing breakdown for display
 */
export function getPricingBreakdown(
    category: TemplateCategory,
    recipients: number,
    monthlyVolume: number = 0,
    exchangeRate: number = 5.00
) {
    const pricePerMessage = calculateEffectivePrice(category, monthlyVolume);
    const totalUSD = calculateCampaignCost(category, recipients, monthlyVolume);
    const totalBRL = usdToBrl(totalUSD, exchangeRate);
    const pricePerMessageBRL = usdToBrl(pricePerMessage, exchangeRate);

    return {
        category,
        recipients,
        pricePerMessageUSD: pricePerMessage,
        pricePerMessageBRL,
        totalUSD,
        totalBRL,
        totalBRLFormatted: formatBRL(totalBRL),
        pricePerMessageBRLFormatted: formatBRL(pricePerMessageBRL),
    };
}
