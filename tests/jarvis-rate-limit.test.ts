import { describe, expect, test, beforeEach } from 'vitest';
import { checkRateLimit, rateLimitConfigs } from '@/lib/jarvis/rate-limit';

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Clear the in-memory store between tests
    // This is a workaround since we can't easily access the private store
  });

  describe('checkRateLimit', () => {
    test('allows requests within limit', async () => {
      const { allowed, info } = await checkRateLimit('test-user-1', { maxRequests: 5, windowMs: 60000 });
      
      expect(allowed).toBe(true);
      expect(info.limit).toBe(5);
      expect(info.remaining).toBe(4);
      expect(info.total).toBe(1);
    });

    test('blocks requests over limit', async () => {
      const config = { maxRequests: 2, windowMs: 60000 };
      
      await checkRateLimit('test-user-2', config); // 1
      await checkRateLimit('test-user-2', config); // 2
      const { allowed } = await checkRateLimit('test-user-2', config); // 3 - should block
      
      expect(allowed).toBe(false);
    });

    test('separate identifiers have separate limits', async () => {
      const config = { maxRequests: 1, windowMs: 60000 };
      
      const { allowed: a1 } = await checkRateLimit('user-a', config);
      const { allowed: b1 } = await checkRateLimit('user-b', config);
      const { allowed: a2 } = await checkRateLimit('user-a', config);
      
      expect(a1).toBe(true);
      expect(b1).toBe(true);
      expect(a2).toBe(false);
    });

    test('different windows reset independently', async () => {
      const config = { maxRequests: 1, windowMs: 100 }; // 100ms window
      
      const { allowed: a1 } = await checkRateLimit('user-window', config);
      expect(a1).toBe(true);
      
      const { allowed: a2 } = await checkRateLimit('user-window', config);
      expect(a2).toBe(false);
      
      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const { allowed: a3 } = await checkRateLimit('user-window', config);
      expect(a3).toBe(true);
    });

    test('returns correct rate limit info', async () => {
      const config = { maxRequests: 10, windowMs: 60000 };
      const { info } = await checkRateLimit('info-test', config);
      
      expect(info.limit).toBe(10);
      expect(info.remaining).toBe(9);
      expect(info.total).toBe(1);
      expect(info.resetTime).toBeGreaterThan(Date.now());
    });
  });

  describe('rateLimitConfigs', () => {
    test('strict config is restrictive', () => {
      expect(rateLimitConfigs.strict.maxRequests).toBe(10);
      expect(rateLimitConfigs.strict.windowMs).toBe(60000);
    });

    test('standard config is moderate', () => {
      expect(rateLimitConfigs.standard.maxRequests).toBe(60);
    });

    test('relaxed config is permissive', () => {
      expect(rateLimitConfigs.relaxed.maxRequests).toBe(300);
    });

    test('auth config is very restrictive', () => {
      expect(rateLimitConfigs.auth.maxRequests).toBe(5);
      expect(rateLimitConfigs.auth.windowMs).toBe(15 * 60 * 1000);
    });

    test('webhook config allows bursts', () => {
      expect(rateLimitConfigs.webhook.maxRequests).toBe(100);
    });
  });
});