/**
 * Comprehensive Health Checks
 * 
 * Checks all system dependencies and reports detailed status
 */

import { statfsSync } from 'node:fs';
import { getDb } from '@/lib/data';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptimeMs: number;
  checks: HealthCheck[];
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const db = getDb();
    // Read through the repository layer to verify DB connectivity without
    // reaching for a raw handle the app-level singleton does not expose.
    db.meta.get('seed_version');
    return {
      name: 'database',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: { connected: true },
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkDiskSpace(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Real free/total space for the volume the app writes to.
    const stats = statfsSync(process.cwd());
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const toGb = (bytes: number): number => Math.round((bytes / 1024 ** 3) * 10) / 10;
    return {
      name: 'disk',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: { freeSpaceGb: toGb(freeBytes), totalSpaceGb: toGb(totalBytes) },
    };
  } catch (error) {
    return {
      name: 'disk',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkExternalServices(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  
  // Check Stripe if configured
  if (process.env.STRIPE_SECRET_KEY) {
    const start = Date.now();
    try {
      const res = await fetch('https://api.stripe.com/v1/account', {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      checks.push({
        name: 'stripe',
        status: res.ok ? 'healthy' : 'degraded',
        latencyMs: Date.now() - start,
        details: { httpStatus: res.status },
      });
    } catch (error) {
      checks.push({
        name: 'stripe',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Check Wise if configured
  if (process.env.WISE_API_KEY) {
    const start = Date.now();
    try {
      const res = await fetch('https://api.wise.com/v1/profile', {
        headers: { Authorization: `Bearer ${process.env.WISE_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      checks.push({
        name: 'wise',
        status: res.ok ? 'healthy' : 'degraded',
        latencyMs: Date.now() - start,
        details: { httpStatus: res.status },
      });
    } catch (error) {
      checks.push({
        name: 'wise',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Check NOWPayments if configured
  if (process.env.NOWPAYMENTS_API_KEY) {
    const start = Date.now();
    try {
      const res = await fetch('https://api.nowpayments.io/v1/status', {
        headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
      checks.push({
        name: 'nowpayments',
        status: res.ok ? 'healthy' : 'degraded',
        latencyMs: Date.now() - start,
        details: { httpStatus: res.status },
      });
    } catch (error) {
      checks.push({
        name: 'nowpayments',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return checks;
}

export async function runHealthChecks(): Promise<HealthReport> {
  const checks: HealthCheck[] = [];

  // Core checks (always run)
  checks.push(await checkDatabase());
  checks.push(await checkDiskSpace());

  // External service checks (if configured)
  checks.push(...await checkExternalServices());

  // Determine overall status
  const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
  const degradedCount = checks.filter(c => c.status === 'degraded').length;

  let overallStatus: HealthReport['status'] = 'healthy';
  if (unhealthyCount > 0) overallStatus = 'unhealthy';
  else if (degradedCount > 0) overallStatus = 'degraded';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptimeMs: Math.round(process.uptime() * 1000),
    checks,
  };
}

export async function quickHealthCheck(): Promise<{ ok: boolean; timestamp: string }> {
  try {
    const db = getDb();
    db.meta.get('seed_version');
    return { ok: true, timestamp: new Date().toISOString() };
  } catch {
    return { ok: false, timestamp: new Date().toISOString() };
  }
}