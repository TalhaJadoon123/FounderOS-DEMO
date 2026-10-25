/**
 * Founder OS health endpoints.
 *
 * GET /api/health           — quick liveness probe (used by Docker)
 * GET /api/health?full=1    — comprehensive health report
 * GET /api/health?version=1 — includes version info
 */

import { NextResponse } from 'next/server';
import { runHealthChecks, quickHealthCheck } from '@/lib/jarvis/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const full = searchParams.get('full') === '1';
  const version = searchParams.get('version');

  if (!full) {
    // Quick liveness probe for Docker/load balancers
    const result = await quickHealthCheck();
    return NextResponse.json(
      { ok: result.ok, timestamp: result.timestamp, service: 'founder-os' },
      { status: result.ok ? 200 : 503 }
    );
  }

  // Comprehensive health report
  const report = await runHealthChecks();
  
  const statusCode = report.status === 'healthy' ? 200 : 
                     report.status === 'degraded' ? 200 : 503;

  const response = {
    ...report,
    ...(version && { version: process.env.npm_package_version || '1.0.0' }),
  };

  return NextResponse.json(response, { status: statusCode });
}