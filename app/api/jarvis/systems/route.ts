/**
 * Jarvis systems API — live connection state for every external system.
 *
 * GET  /api/jarvis/systems   → probe every connector now, return the board
 * POST /api/jarvis/systems   → "Probe all" / connect-all; persists the result
 *
 * There is no endpoint that marks a system connected without a successful
 * provider probe. A missing key is reported as not_configured with the exact
 * env names the operator must supply.
 */

import { NextResponse } from 'next/server';
import { listSystems, probeAllSystems } from '@/lib/jarvis/systems';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Probing 30 providers can take a few seconds; allow the route to finish.
export const maxDuration = 60;

export async function GET() {
  try {
    const report = await listSystems();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const report = await probeAllSystems();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
