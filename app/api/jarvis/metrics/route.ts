/**
 * Jarvis metrics dashboard data.
 *
 * GET /api/jarvis/metrics
 */

import { NextResponse } from 'next/server';
import { computeMetrics } from '@/lib/jarvis/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const metrics = computeMetrics();
  return NextResponse.json({ metrics });
}
