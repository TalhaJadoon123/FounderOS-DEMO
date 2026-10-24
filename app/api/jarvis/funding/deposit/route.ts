/**
 * Record a local deposit into `jarvis_revenue` (source: 'deposit').
 *
 * POST /api/jarvis/funding/deposit
 * Body: { projectId, amountCents, currency?, reference, note?, feeCents? }
 *
 * Requires Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN> or x-jarvis-token
 * when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { recordLocalFunding } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const { projectId, amountCents, currency, reference, note, feeCents } = body;

  if (!projectId || typeof amountCents !== 'number' || !reference) {
    return NextResponse.json(
      { ok: false, error: 'projectId, amountCents, and reference are required' },
      { status: 400 },
    );
  }
  if (amountCents <= 0) {
    return NextResponse.json(
      { ok: false, error: 'amountCents must be positive for a deposit' },
      { status: 400 },
    );
  }

  try {
    const revenue = recordLocalFunding({
      projectId,
      amountCents,
      currency: currency ?? 'USD',
      type: 'deposit',
      reference,
      note,
      feeCents: feeCents ?? 0,
    });
    return NextResponse.json({
      ok: true,
      revenue: {
        id: revenue.id,
        source: revenue.source,
        amountCents: revenue.amountCents,
        feeCents: revenue.feeCents,
        netCents: revenue.netCents,
        currency: revenue.currency,
        status: revenue.status,
        occurredAt: revenue.occurredAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
