import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { recordLocalFunding } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Transfer between bot and FounderOS ledger.
 *
 * POST /api/finances/transfer
 * Body: { type: 'deposit' | 'withdrawal', projectId, amountCents, currency?, reference, note?, feeCents? }
 *
 * Deposits increase the project's net balance; withdrawals decrease it and are
 * blocked if they would take net below zero (unless JARVIS_ALLOW_NEGATIVE_WITHDRAWALS=1).
 * Requires ingest auth when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

export async function POST(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const { type, projectId, amountCents, currency, reference, note, feeCents } = body;

  if (!type || !projectId || typeof amountCents !== 'number' || !reference) {
    return NextResponse.json(
      { ok: false, error: 'type, projectId, amountCents, and reference are required' },
      { status: 400 },
    );
  }
  if (type !== 'deposit' && type !== 'withdrawal') {
    return NextResponse.json({ ok: false, error: "type must be 'deposit' or 'withdrawal'" }, { status: 400 });
  }
  if (amountCents <= 0) {
    return NextResponse.json({ ok: false, error: 'amountCents must be positive' }, { status: 400 });
  }

  try {
    const revenue = recordLocalFunding({
      projectId,
      amountCents,
      currency: currency ?? 'USD',
      type: type as 'deposit' | 'withdrawal',
      reference,
      note,
      feeCents: feeCents ?? 0,
    });
    return NextResponse.json({
      ok: true,
      transfer: {
        type: revenue.source,
        amountCents: revenue.amountCents,
        netCents: revenue.netCents,
        currency: revenue.currency,
        status: revenue.status,
        reference: revenue.externalId,
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
