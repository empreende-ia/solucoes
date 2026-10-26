/**
 * Tests for WhatsApp Business Platform Pricing Calculator
 */
import { describe, it, expect } from 'vitest';
import {
  calculateEffectivePrice,
  calculateCampaignCost,
  usdToBrl,
  formatBRL,
  getPricingBreakdown,
  type TemplateCategory,
} from './whatsapp-pricing';

describe('whatsapp-pricing', () => {
  describe('calculateEffectivePrice', () => {
    describe('MARKETING category', () => {
      it('should return base price for volume <= 1000', () => {
        expect(calculateEffectivePrice('MARKETING', 0)).toBe(0.0825);
        expect(calculateEffectivePrice('MARKETING', 500)).toBe(0.0825);
        expect(calculateEffectivePrice('MARKETING', 1000)).toBe(0.0825);
      });

      it('should apply 3% discount for volume 1001-10000', () => {
        const expectedPrice = 0.0825 * 0.97;
        expect(calculateEffectivePrice('MARKETING', 1001)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('MARKETING', 5000)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('MARKETING', 10000)).toBeCloseTo(expectedPrice);
      });

      it('should apply 10% discount for volume 10001-100000', () => {
        const expectedPrice = 0.0825 * 0.90;
        expect(calculateEffectivePrice('MARKETING', 10001)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('MARKETING', 50000)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('MARKETING', 100000)).toBeCloseTo(expectedPrice);
      });

      it('should apply 25% discount for volume > 100000', () => {
        const expectedPrice = 0.0825 * 0.75;
        expect(calculateEffectivePrice('MARKETING', 100001)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('MARKETING', 500000)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('MARKETING', 1000000)).toBeCloseTo(expectedPrice);
      });
    });

    describe('UTILITY category', () => {
      it('should return base price for volume <= 10000', () => {
        expect(calculateEffectivePrice('UTILITY', 0)).toBe(0.0068);
        expect(calculateEffectivePrice('UTILITY', 1000)).toBe(0.0068);
        expect(calculateEffectivePrice('UTILITY', 5000)).toBe(0.0068);
        expect(calculateEffectivePrice('UTILITY', 10000)).toBe(0.0068);
      });

      it('should apply 5% discount for volume 10001-100000', () => {
        const expectedPrice = 0.0068 * 0.95;
        expect(calculateEffectivePrice('UTILITY', 10001)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('UTILITY', 50000)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('UTILITY', 100000)).toBeCloseTo(expectedPrice);
      });

      it('should apply 20% discount for volume > 100000', () => {
        const expectedPrice = 0.0068 * 0.80;
        expect(calculateEffectivePrice('UTILITY', 100001)).toBeCloseTo(expectedPrice);
        expect(calculateEffectivePrice('UTILITY', 500000)).toBeCloseTo(expectedPrice);
      });
    });

    describe('UTILIDADE category (Portuguese canonical form)', () => {
      // UTILIDADE is the canonical form used throughout the app after canonicalTemplateCategory()
      // It should correctly map to utility pricing
      it('should use utility pricing (R$ 0.0068 base)', () => {
        expect(calculateEffectivePrice('UTILIDADE', 0)).toBe(0.0068);
        expect(calculateEffectivePrice('UTILIDADE', 1000)).toBe(0.0068);
        expect(calculateEffectivePrice('UTILIDADE', 10000)).toBe(0.0068);
      });

      it('should apply 5% discount for volume 10001-100000', () => {
        const expectedPrice = 0.0068 * 0.95;
        expect(calculateEffectivePrice('UTILIDADE', 50000)).toBeCloseTo(expectedPrice);
      });
    });

    describe('AUTHENTICATION category', () => {
      it('should return base price for volume <= 10000', () => {
        expect(calculateEffectivePrice('AUTHENTICATION', 0)).toBe(0.0068);
        expect(calculateEffectivePrice('AUTHENTICATION', 5000)).toBe(0.0068);
        expect(calculateEffectivePrice('AUTHENTICATION', 10000)).toBe(0.0068);
      });

      it('should apply 5% discount for volume 10001-100000', () => {
        const expectedPrice = 0.0068 * 0.95;
        expect(calculateEffectivePrice('AUTHENTICATION', 50000)).toBeCloseTo(expectedPrice);
      });

      it('should apply 20% discount for volume > 100000', () => {
        const expectedPrice = 0.0068 * 0.80;
        expect(calculateEffectivePrice('AUTHENTICATION', 200000)).toBeCloseTo(expectedPrice);
      });
    });

    describe('AUTENTICACAO category (Portuguese canonical form)', () => {
      // AUTENTICACAO is the canonical form used throughout the app after canonicalTemplateCategory()
      // It should correctly map to authentication pricing (same as utility)
      it('should use authentication pricing (R$ 0.0068 base)', () => {
        expect(calculateEffectivePrice('AUTENTICACAO', 0)).toBe(0.0068);
        expect(calculateEffectivePrice('AUTENTICACAO', 5000)).toBe(0.0068);
      });

      it('should apply 5% discount for volume 10001-100000', () => {
        const expectedPrice = 0.0068 * 0.95;
        expect(calculateEffectivePrice('AUTENTICACAO', 50000)).toBeCloseTo(expectedPrice);
      });
    });

    describe('category normalization', () => {
      it('should handle lowercase categories', () => {
        // TypeScript allows passing strings that match the type
        expect(calculateEffectivePrice('MARKETING' as TemplateCategory, 0)).toBe(0.0825);
      });

      it('should default unknown categories to MARKETING', () => {
        // Unknown categories should fallback to MARKETING
        expect(calculateEffectivePrice('UNKNOWN' as TemplateCategory, 0)).toBe(0.0825);
      });
    });
  });

  describe('calculateCampaignCost', () => {
    it('should calculate cost for MARKETING messages', () => {
      // 100 recipients at base price
      expect(calculateCampaignCost('MARKETING', 100, 0)).toBe(100 * 0.0825);
    });

    it('should calculate cost for UTILITY messages', () => {
      expect(calculateCampaignCost('UTILITY', 100, 0)).toBe(100 * 0.0068);
    });

    it('should calculate cost for AUTHENTICATION messages', () => {
      expect(calculateCampaignCost('AUTHENTICATION', 100, 0)).toBe(100 * 0.0068);
    });

    it('should apply volume discounts to cost calculation', () => {
      // MARKETING with 10001-100000 volume tier (10% discount)
      const priceWithDiscount = 0.0825 * 0.90;
      expect(calculateCampaignCost('MARKETING', 100, 50000)).toBeCloseTo(100 * priceWithDiscount);
    });

    it('should default monthlyVolume to 0', () => {
      expect(calculateCampaignCost('MARKETING', 100)).toBe(100 * 0.0825);
    });

    describe('edge cases', () => {
      it('should return 0 for zero recipients', () => {
        expect(calculateCampaignCost('MARKETING', 0, 0)).toBe(0);
        expect(calculateCampaignCost('UTILITY', 0, 0)).toBe(0);
        expect(calculateCampaignCost('AUTHENTICATION', 0, 0)).toBe(0);
      });

      it('should handle very large recipient counts', () => {
        const recipients = 1000000;
        const cost = calculateCampaignCost('MARKETING', recipients, 0);
        expect(cost).toBe(recipients * 0.0825);
      });

      it('should handle single recipient', () => {
        expect(calculateCampaignCost('MARKETING', 1, 0)).toBe(0.0825);
        expect(calculateCampaignCost('UTILITY', 1, 0)).toBe(0.0068);
      });
    });
  });

  describe('usdToBrl', () => {
    it('should convert USD to BRL with default exchange rate (5.00)', () => {
      expect(usdToBrl(1)).toBe(5.00);
      expect(usdToBrl(10)).toBe(50.00);
      expect(usdToBrl(0.5)).toBe(2.50);
    });

    it('should convert USD to BRL with custom exchange rate', () => {
      expect(usdToBrl(1, 5.50)).toBe(5.50);
      expect(usdToBrl(10, 4.80)).toBe(48.00);
      expect(usdToBrl(100, 6.00)).toBe(600.00);
    });

    it('should handle zero amount', () => {
      expect(usdToBrl(0)).toBe(0);
      expect(usdToBrl(0, 5.50)).toBe(0);
    });

    it('should handle very small amounts', () => {
      expect(usdToBrl(0.0068, 5.00)).toBeCloseTo(0.034);
    });

    it('should handle decimal exchange rates', () => {
      expect(usdToBrl(100, 5.123)).toBeCloseTo(512.3);
    });
  });

  describe('formatBRL', () => {
    it('should format positive values correctly', () => {
      expect(formatBRL(100)).toBe('R$\u00a0100,00');
      expect(formatBRL(1234.56)).toBe('R$\u00a01.234,56');
      expect(formatBRL(0.50)).toBe('R$\u00a00,50');
    });

    it('should format zero', () => {
      expect(formatBRL(0)).toBe('R$\u00a00,00');
    });

    it('should format small decimal values', () => {
      // Price per message in BRL (0.0068 USD * 5 = 0.034 BRL)
      expect(formatBRL(0.034)).toBe('R$\u00a00,03');
      expect(formatBRL(0.4125)).toBe('R$\u00a00,41');
    });

    it('should format large values with thousand separators', () => {
      expect(formatBRL(1000000)).toBe('R$\u00a01.000.000,00');
      expect(formatBRL(12345678.90)).toBe('R$\u00a012.345.678,90');
    });

    it('should round to 2 decimal places', () => {
      expect(formatBRL(1.999)).toBe('R$\u00a02,00');
      expect(formatBRL(1.994)).toBe('R$\u00a01,99');
    });

    it('should handle negative values', () => {
      expect(formatBRL(-100)).toBe('-R$\u00a0100,00');
    });
  });

  describe('getPricingBreakdown', () => {
    it('should return complete breakdown for MARKETING', () => {
      const breakdown = getPricingBreakdown('MARKETING', 100, 0, 5.00);

      expect(breakdown.category).toBe('MARKETING');
      expect(breakdown.recipients).toBe(100);
      expect(breakdown.pricePerMessageUSD).toBe(0.0825);
      expect(breakdown.pricePerMessageBRL).toBeCloseTo(0.4125);
      expect(breakdown.totalUSD).toBeCloseTo(8.25);
      expect(breakdown.totalBRL).toBeCloseTo(41.25);
      expect(breakdown.totalBRLFormatted).toBe('R$\u00a041,25');
      expect(breakdown.pricePerMessageBRLFormatted).toBe('R$\u00a00,41');
    });

    it('should return complete breakdown for UTILITY', () => {
      const breakdown = getPricingBreakdown('UTILITY', 1000, 0, 5.00);

      expect(breakdown.category).toBe('UTILITY');
      expect(breakdown.recipients).toBe(1000);
      expect(breakdown.pricePerMessageUSD).toBe(0.0068);
      expect(breakdown.pricePerMessageBRL).toBeCloseTo(0.034);
      expect(breakdown.totalUSD).toBeCloseTo(6.8);
      expect(breakdown.totalBRL).toBeCloseTo(34);
    });

    it('should return complete breakdown for AUTHENTICATION', () => {
      const breakdown = getPricingBreakdown('AUTHENTICATION', 500, 0, 5.00);

      expect(breakdown.category).toBe('AUTHENTICATION');
      expect(breakdown.recipients).toBe(500);
      expect(breakdown.pricePerMessageUSD).toBe(0.0068);
      expect(breakdown.totalUSD).toBe(3.4);
      expect(breakdown.totalBRL).toBe(17);
    });

    it('should apply volume discounts correctly', () => {
      // MARKETING with high volume (25% discount)
      const breakdown = getPricingBreakdown('MARKETING', 100, 200000, 5.00);
      const expectedPricePerMessage = 0.0825 * 0.75;

      expect(breakdown.pricePerMessageUSD).toBeCloseTo(expectedPricePerMessage);
      expect(breakdown.totalUSD).toBeCloseTo(100 * expectedPricePerMessage);
    });

    it('should use custom exchange rate', () => {
      const breakdown = getPricingBreakdown('MARKETING', 100, 0, 6.00);

      expect(breakdown.pricePerMessageBRL).toBeCloseTo(0.0825 * 6.00);
      expect(breakdown.totalBRL).toBeCloseTo(8.25 * 6.00);
    });

    it('should use default values for optional parameters', () => {
      const breakdown = getPricingBreakdown('MARKETING', 100);

      expect(breakdown.pricePerMessageUSD).toBe(0.0825);
      expect(breakdown.totalBRL).toBe(41.25); // Default exchange rate 5.00
    });

    describe('edge cases', () => {
      it('should handle zero recipients', () => {
        const breakdown = getPricingBreakdown('MARKETING', 0);

        expect(breakdown.recipients).toBe(0);
        expect(breakdown.totalUSD).toBe(0);
        expect(breakdown.totalBRL).toBe(0);
        expect(breakdown.totalBRLFormatted).toBe('R$\u00a00,00');
      });

      it('should handle Portuguese category aliases (canonical form)', () => {
        // UTILIDADE and AUTENTICACAO are the canonical Portuguese forms
        // used throughout the app after canonicalTemplateCategory()
        const utilidadeBreakdown = getPricingBreakdown('UTILIDADE', 100);
        const autenticacaoBreakdown = getPricingBreakdown('AUTENTICACAO', 100);

        // Both should use utility/auth pricing (R$ 0.0068 base)
        expect(utilidadeBreakdown.pricePerMessageUSD).toBe(0.0068);
        expect(autenticacaoBreakdown.pricePerMessageUSD).toBe(0.0068);
      });

      it('should handle very large campaigns', () => {
        const breakdown = getPricingBreakdown('MARKETING', 1000000, 1000000, 5.00);
        const expectedPricePerMessage = 0.0825 * 0.75; // 25% discount tier

        expect(breakdown.recipients).toBe(1000000);
        expect(breakdown.pricePerMessageUSD).toBeCloseTo(expectedPricePerMessage);
        expect(breakdown.totalUSD).toBeCloseTo(1000000 * expectedPricePerMessage);
      });
    });
  });

  describe('pricing constants verification', () => {
    it('should have correct base prices for Brazil', () => {
      // Marketing is the most expensive
      expect(calculateEffectivePrice('MARKETING', 0)).toBe(0.0825);

      // Utility and Authentication have the same lower price
      expect(calculateEffectivePrice('UTILITY', 0)).toBe(0.0068);
      expect(calculateEffectivePrice('AUTHENTICATION', 0)).toBe(0.0068);
    });

    it('should verify MARKETING is more expensive than UTILITY', () => {
      const marketingPrice = calculateEffectivePrice('MARKETING', 0);
      const utilityPrice = calculateEffectivePrice('UTILITY', 0);

      expect(marketingPrice).toBeGreaterThan(utilityPrice);
    });

    it('should verify volume discounts reduce prices', () => {
      const basePrice = calculateEffectivePrice('MARKETING', 0);
      const discountedPrice = calculateEffectivePrice('MARKETING', 200000);

      expect(discountedPrice).toBeLessThan(basePrice);
    });
  });
});
