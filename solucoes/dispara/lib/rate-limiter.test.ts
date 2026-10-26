import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TokenBucketRateLimiter,
  createRateLimiter,
  DEFAULT_RATE_LIMIT,
  MAX_RATE_LIMIT,
  MIN_RATE_LIMIT,
  type RateLimiter,
} from './rate-limiter';

describe('rate-limiter', () => {
  describe('constants', () => {
    it('should export DEFAULT_RATE_LIMIT as 80', () => {
      expect(DEFAULT_RATE_LIMIT).toBe(80);
    });

    it('should export MAX_RATE_LIMIT as 1000', () => {
      expect(MAX_RATE_LIMIT).toBe(1000);
    });

    it('should export MIN_RATE_LIMIT as 1', () => {
      expect(MIN_RATE_LIMIT).toBe(1);
    });
  });

  describe('TokenBucketRateLimiter', () => {
    let limiter: TokenBucketRateLimiter;

    afterEach(() => {
      if (limiter) {
        limiter.stop();
      }
    });

    describe('constructor', () => {
      it('should create a limiter with default rate', () => {
        limiter = new TokenBucketRateLimiter();
        expect(limiter.getTokensAvailable()).toBe(DEFAULT_RATE_LIMIT);
      });

      it('should create a limiter with custom rate', () => {
        limiter = new TokenBucketRateLimiter(50);
        expect(limiter.getTokensAvailable()).toBe(50);
      });

      it('should accept MIN_RATE_LIMIT as valid rate', () => {
        limiter = new TokenBucketRateLimiter(MIN_RATE_LIMIT);
        expect(limiter.getTokensAvailable()).toBe(MIN_RATE_LIMIT);
      });

      it('should accept MAX_RATE_LIMIT as valid rate', () => {
        limiter = new TokenBucketRateLimiter(MAX_RATE_LIMIT);
        expect(limiter.getTokensAvailable()).toBe(MAX_RATE_LIMIT);
      });

      it('should throw error for rate below MIN_RATE_LIMIT', () => {
        expect(() => new TokenBucketRateLimiter(0)).toThrow(
          `Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}`
        );
      });

      it('should throw error for negative rate', () => {
        expect(() => new TokenBucketRateLimiter(-1)).toThrow(
          `Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}`
        );
      });

      it('should throw error for rate above MAX_RATE_LIMIT', () => {
        expect(() => new TokenBucketRateLimiter(1001)).toThrow(
          `Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}`
        );
      });
    });

    describe('acquire', () => {
      it('should consume one token when called', async () => {
        limiter = new TokenBucketRateLimiter(10);
        const initialTokens = limiter.getTokensAvailable();

        await limiter.acquire();

        expect(limiter.getTokensAvailable()).toBe(initialTokens - 1);
      });

      it('should consume multiple tokens on multiple calls', async () => {
        limiter = new TokenBucketRateLimiter(10);

        await limiter.acquire();
        await limiter.acquire();
        await limiter.acquire();

        expect(limiter.getTokensAvailable()).toBe(7);
      });

      it('should allow consuming all tokens', async () => {
        limiter = new TokenBucketRateLimiter(5);

        for (let i = 0; i < 5; i++) {
          await limiter.acquire();
        }

        expect(limiter.getTokensAvailable()).toBe(0);
      });

      it('should wait when no tokens available', async () => {
        vi.useFakeTimers();
        limiter = new TokenBucketRateLimiter(2);

        // Consume all tokens
        await limiter.acquire();
        await limiter.acquire();
        expect(limiter.getTokensAvailable()).toBe(0);

        // Start acquire that should wait
        let acquired = false;
        const acquirePromise = limiter.acquire().then(() => {
          acquired = true;
        });

        // Should not be acquired yet
        expect(acquired).toBe(false);

        // Advance time and run timers
        vi.advanceTimersByTime(1000);

        await acquirePromise;
        expect(acquired).toBe(true);

        vi.useRealTimers();
      });
    });

    describe('reset', () => {
      it('should restore tokens to max capacity', async () => {
        limiter = new TokenBucketRateLimiter(10);

        // Consume some tokens
        await limiter.acquire();
        await limiter.acquire();
        await limiter.acquire();
        expect(limiter.getTokensAvailable()).toBe(7);

        // Reset
        limiter.reset();

        expect(limiter.getTokensAvailable()).toBe(10);
      });

      it('should work even when all tokens consumed', async () => {
        limiter = new TokenBucketRateLimiter(3);

        await limiter.acquire();
        await limiter.acquire();
        await limiter.acquire();
        expect(limiter.getTokensAvailable()).toBe(0);

        limiter.reset();

        expect(limiter.getTokensAvailable()).toBe(3);
      });

      it('should not exceed max capacity on reset', () => {
        limiter = new TokenBucketRateLimiter(10);

        // Reset multiple times
        limiter.reset();
        limiter.reset();
        limiter.reset();

        expect(limiter.getTokensAvailable()).toBe(10);
      });
    });

    describe('getTokensAvailable', () => {
      it('should return floor of available tokens', async () => {
        limiter = new TokenBucketRateLimiter(10);
        expect(limiter.getTokensAvailable()).toBe(10);
      });

      it('should return 0 when no tokens available', async () => {
        limiter = new TokenBucketRateLimiter(2);

        await limiter.acquire();
        await limiter.acquire();

        expect(limiter.getTokensAvailable()).toBe(0);
      });

      it('should return integer value', async () => {
        limiter = new TokenBucketRateLimiter(5);

        await limiter.acquire();

        const tokens = limiter.getTokensAvailable();
        expect(Number.isInteger(tokens)).toBe(true);
      });
    });

    describe('stop', () => {
      it('should stop the refill interval', () => {
        vi.useFakeTimers();
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

        limiter = new TokenBucketRateLimiter(10);
        limiter.stop();

        expect(clearIntervalSpy).toHaveBeenCalled();

        vi.useRealTimers();
        clearIntervalSpy.mockRestore();
      });

      it('should be safe to call multiple times', () => {
        limiter = new TokenBucketRateLimiter(10);

        // Should not throw
        limiter.stop();
        limiter.stop();
        limiter.stop();
      });

      it('should prevent further token refills after stop', async () => {
        vi.useFakeTimers();
        limiter = new TokenBucketRateLimiter(10);

        // Consume some tokens
        await limiter.acquire();
        await limiter.acquire();
        expect(limiter.getTokensAvailable()).toBe(8);

        // Stop the limiter
        limiter.stop();

        // Advance time
        vi.advanceTimersByTime(5000);

        // Tokens should not have been refilled
        expect(limiter.getTokensAvailable()).toBe(8);

        vi.useRealTimers();
      });
    });

    describe('updateRate', () => {
      it('should update maxTokens to new rate', async () => {
        limiter = new TokenBucketRateLimiter(10);

        limiter.updateRate(20);

        // Reset to verify new max
        limiter.reset();
        expect(limiter.getTokensAvailable()).toBe(20);
      });

      it('should accept MIN_RATE_LIMIT', () => {
        limiter = new TokenBucketRateLimiter(10);
        expect(() => limiter.updateRate(MIN_RATE_LIMIT)).not.toThrow();
      });

      it('should accept MAX_RATE_LIMIT', () => {
        limiter = new TokenBucketRateLimiter(10);
        expect(() => limiter.updateRate(MAX_RATE_LIMIT)).not.toThrow();
      });

      it('should throw for rate below MIN_RATE_LIMIT', () => {
        limiter = new TokenBucketRateLimiter(10);
        expect(() => limiter.updateRate(0)).toThrow(
          `Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}`
        );
      });

      it('should throw for negative rate', () => {
        limiter = new TokenBucketRateLimiter(10);
        expect(() => limiter.updateRate(-5)).toThrow(
          `Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}`
        );
      });

      it('should throw for rate above MAX_RATE_LIMIT', () => {
        limiter = new TokenBucketRateLimiter(10);
        expect(() => limiter.updateRate(1001)).toThrow(
          `Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}`
        );
      });

      it('should clamp current tokens when reducing rate', async () => {
        limiter = new TokenBucketRateLimiter(100);
        expect(limiter.getTokensAvailable()).toBe(100);

        limiter.updateRate(10);

        // Current tokens should be clamped to new maxTokens
        expect(limiter.getTokensAvailable()).toBe(10);
      });

      it('should not increase current tokens when increasing rate', async () => {
        limiter = new TokenBucketRateLimiter(10);

        // Consume some tokens
        await limiter.acquire();
        await limiter.acquire();
        expect(limiter.getTokensAvailable()).toBe(8);

        limiter.updateRate(50);

        // Tokens should remain the same (not auto-increase to new max)
        expect(limiter.getTokensAvailable()).toBe(8);
      });

      it('should restart refill interval with new rate', () => {
        vi.useFakeTimers();
        const setIntervalSpy = vi.spyOn(global, 'setInterval');

        limiter = new TokenBucketRateLimiter(10);
        const initialCallCount = setIntervalSpy.mock.calls.length;

        limiter.updateRate(20);

        // setInterval should be called again for new interval
        expect(setIntervalSpy.mock.calls.length).toBeGreaterThan(initialCallCount);

        vi.useRealTimers();
        setIntervalSpy.mockRestore();
      });
    });

    describe('token refill behavior', () => {
      it('should refill tokens over time', async () => {
        vi.useFakeTimers();
        limiter = new TokenBucketRateLimiter(10);

        // Consume all tokens
        for (let i = 0; i < 10; i++) {
          await limiter.acquire();
        }
        expect(limiter.getTokensAvailable()).toBe(0);

        // Advance time by 1 second
        vi.advanceTimersByTime(1000);

        // Should have refilled tokens (rate is 10 per second)
        expect(limiter.getTokensAvailable()).toBe(10);

        vi.useRealTimers();
      });

      it('should not exceed maxTokens on refill', async () => {
        vi.useFakeTimers();
        limiter = new TokenBucketRateLimiter(10);

        // Don't consume any tokens
        expect(limiter.getTokensAvailable()).toBe(10);

        // Advance time by several seconds
        vi.advanceTimersByTime(5000);

        // Should still be at max
        expect(limiter.getTokensAvailable()).toBe(10);

        vi.useRealTimers();
      });

      it('should partially refill tokens', async () => {
        vi.useFakeTimers();
        limiter = new TokenBucketRateLimiter(10);

        // Consume 5 tokens
        for (let i = 0; i < 5; i++) {
          await limiter.acquire();
        }
        expect(limiter.getTokensAvailable()).toBe(5);

        // Advance time by 1 second (refill rate is 10/sec)
        vi.advanceTimersByTime(1000);

        // Should be back to max
        expect(limiter.getTokensAvailable()).toBe(10);

        vi.useRealTimers();
      });
    });
  });

  describe('createRateLimiter', () => {
    let limiter: RateLimiter;

    afterEach(() => {
      if (limiter) {
        limiter.stop();
      }
    });

    it('should create a RateLimiter with default rate', () => {
      limiter = createRateLimiter();
      expect(limiter.getTokensAvailable()).toBe(DEFAULT_RATE_LIMIT);
    });

    it('should create a RateLimiter with custom rate', () => {
      limiter = createRateLimiter(25);
      expect(limiter.getTokensAvailable()).toBe(25);
    });

    it('should return an instance implementing RateLimiter interface', () => {
      limiter = createRateLimiter();

      expect(typeof limiter.acquire).toBe('function');
      expect(typeof limiter.reset).toBe('function');
      expect(typeof limiter.getTokensAvailable).toBe('function');
      expect(typeof limiter.stop).toBe('function');
      expect(typeof limiter.updateRate).toBe('function');
    });

    it('should throw for invalid rates', () => {
      expect(() => createRateLimiter(0)).toThrow();
      expect(() => createRateLimiter(-1)).toThrow();
      expect(() => createRateLimiter(1001)).toThrow();
    });

    it('should accept boundary values', () => {
      const minLimiter = createRateLimiter(MIN_RATE_LIMIT);
      expect(minLimiter.getTokensAvailable()).toBe(MIN_RATE_LIMIT);
      minLimiter.stop();

      const maxLimiter = createRateLimiter(MAX_RATE_LIMIT);
      expect(maxLimiter.getTokensAvailable()).toBe(MAX_RATE_LIMIT);
      maxLimiter.stop();
    });
  });

  describe('integration tests', () => {
    let limiter: RateLimiter;

    afterEach(() => {
      if (limiter) {
        limiter.stop();
      }
    });

    it('should handle rapid acquire calls', async () => {
      limiter = createRateLimiter(100);

      const promises: Promise<void>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(limiter.acquire());
      }

      await Promise.all(promises);

      expect(limiter.getTokensAvailable()).toBe(50);
    });

    it('should handle reset after partial consumption', async () => {
      limiter = createRateLimiter(20);

      // Consume some
      await limiter.acquire();
      await limiter.acquire();
      expect(limiter.getTokensAvailable()).toBe(18);

      // Reset
      limiter.reset();
      expect(limiter.getTokensAvailable()).toBe(20);

      // Consume more
      await limiter.acquire();
      expect(limiter.getTokensAvailable()).toBe(19);
    });

    it('should handle updateRate followed by reset', async () => {
      limiter = createRateLimiter(10);

      await limiter.acquire();
      await limiter.acquire();
      expect(limiter.getTokensAvailable()).toBe(8);

      limiter.updateRate(50);
      expect(limiter.getTokensAvailable()).toBe(8); // Not changed

      limiter.reset();
      expect(limiter.getTokensAvailable()).toBe(50); // Reset to new max
    });

    it('should handle multiple rate updates', () => {
      limiter = createRateLimiter(10);

      limiter.updateRate(20);
      limiter.reset();
      expect(limiter.getTokensAvailable()).toBe(20);

      limiter.updateRate(5);
      // Tokens clamped to new max
      expect(limiter.getTokensAvailable()).toBe(5);

      limiter.updateRate(100);
      // Tokens stay at 5 (no auto-increase)
      expect(limiter.getTokensAvailable()).toBe(5);
    });
  });
});
