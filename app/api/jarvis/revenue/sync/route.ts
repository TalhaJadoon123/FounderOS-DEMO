/**
 * Sync real revenue from every configured payment provider (Stripe, Wise,
 * NOWPayments). Idempotent: each provider payment id is the external id, so
 * pressing this twice never double-counts.
 *
 * POST /api/jarvis/revenue/sync
 *
 * Returns per-provider results so the operator sees exactly what connected.
 * Without any keys, every provider reports an honest "skipped" — no invented
 * sales.
 */

import { NextResponse } from 'next/server';
import { syncAllRevenue } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string;
      limit?: number;
    };
    const result = await syncAllRevenue({
      projectId: body.projectId,
      limit: body.limit ?? 100,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        results: [],
        synced: 0,
        scanned: 0,
        summary: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
