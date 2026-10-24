/**
 * Sync real revenue from every configured payment provider (Stripe, Wise,
 * NOWPayments). Idempotent: each provider payment id is the external id, so
 * pressing this twice never double-counts.
 *
 * POST /api/jarvis/revenue/sync
 * Body: { projectId?, limit?, maxPages? }
 *
 * Returns per-provider results so the operator sees exactly what connected.
 * Without any keys, every provider reports an honest "skipped" — no invented
 * sales.
 *
 * Requires Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN> or x-jarvis-token
 * when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { syncAllRevenue } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    limit?: number;
    maxPages?: number;
  };
  const result = await syncAllRevenue({
    projectId: body.projectId,
    limit: body.limit ?? 100,
    maxPages: body.maxPages ?? 1,
  });
  return NextResponse.json(result);
}
