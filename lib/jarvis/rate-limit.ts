/**
 * In-process rate limiting.
 *
 * FounderOS runs as a single local/Docker Node process, so a Map is enough.
 * There is deliberately no fake Redis branch: if a multi-instance deployment
 * needs shared limits, swap this store for Redis behind the same function.
 */

import type { NextResponse } from 'next/server';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  total: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
  keyPrefix: 'ratelimit',
};

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, RateLimitEntry>();
let lastCleanup = 0;

function cleanupExpired(now: number): void {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetTime < now) memoryStore.delete(key);
  }
}

export async function checkRateLimit(
  identifier: string,
  config: Partial<RateLimitConfig> = {},
): Promise<{ allowed: boolean; info: RateLimitInfo }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const key = `${cfg.keyPrefix}:${identifier}`;
  const now = Date.now();
  cleanupExpired(now);

  let entry = memoryStore.get(key);
  if (!entry || entry.resetTime < now) {
    entry = { count: 0, resetTime: now + cfg.windowMs };
  }

  entry.count += 1;
  memoryStore.set(key, entry);

  return {
    allowed: entry.count <= cfg.maxRequests,
    info: {
      limit: cfg.maxRequests,
      remaining: Math.max(0, cfg.maxRequests - entry.count),
      resetTime: entry.resetTime,
      total: entry.count,
    },
  };
}

export function addRateLimitHeaders(response: NextResponse, info: RateLimitInfo): void {
  response.headers.set('X-RateLimit-Limit', info.limit.toString());
  response.headers.set('X-RateLimit-Remaining', info.remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(info.resetTime / 1000).toString());
}

export const rateLimitConfigs = {
  strict: { windowMs: 60_000, maxRequests: 10 },
  standard: { windowMs: 60_000, maxRequests: 60 },
  relaxed: { windowMs: 60_000, maxRequests: 300 },
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5 },
  webhook: { windowMs: 60_000, maxRequests: 100 },
};
