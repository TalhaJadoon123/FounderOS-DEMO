/**
 * Jarvis health endpoint — used by Jarvis watch stage to know if a project is live.
 * Projects can also expose their own /api/health; this one reports Jarvis itself.
 */

import { NextResponse } from 'next/server';
import { computeMetrics } from '@/lib/jarvis/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const m = computeMetrics();
  return NextResponse.json({
    ok: true,
    service: 'jarvis',
    autonomy: m.autopilot > 0 ? 'autopilot' : 'assisted',
    projects: m.projects,
    live: m.live,
    healthGreen: m.healthGreen,
    healthRed: m.healthRed,
    pendingApprovals: m.pendingApprovals,
    totalRevenueUsd: (m.totalRevenueCents / 100).toFixed(2),
    lastRunAt: m.lastRunAt,
    timestamp: new Date().toISOString(),
  });
}
