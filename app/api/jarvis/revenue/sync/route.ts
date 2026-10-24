/**
 * Sync real Stripe revenue into the local ledger.
 *
 * POST /api/jarvis/revenue/sync
 *
 * Idempotent: completed checkout sessions are keyed by Stripe session id, so
 * pressing this twice never double-counts. Without STRIPE_SECRET_KEY the route
 * returns a 200 with ok:false and an honest summary — it does not invent sales.
 */

import { NextResponse } from 'next/server';
import { syncStripeRevenue } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST() {
  try {
    const result = await syncStripeRevenue();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, synced: 0, summary: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
