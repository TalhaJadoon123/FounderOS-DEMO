/**
 * Founder OS health endpoint.
 *
 * GET /api/health — returns OK when the app is up.
 * Used by Docker healthcheck and load balancers.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'founder-os',
    timestamp: new Date().toISOString(),
  });
}
