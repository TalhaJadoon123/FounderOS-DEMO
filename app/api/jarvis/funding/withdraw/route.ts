/**
 * Record a local withdrawal into `jarvis_revenue` (source: 'withdrawal',
 * stored as a negative amount so the ledger nets out).
 *
 * POST /api/jarvis/funding/withdraw
 * Body: { projectId, amountCents, currency?, reference, note?, feeCents? }
 *
 * Requires Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN> or x-jarvis-token
 * when JARVIS_LOCAL_INGEST_TOKEN is set.
 *
 * Withdrawals are blocked if they would take the project's net balance below
 * zero, unless JARVIS_ALLOW_NEGATIVE_WITHDRAWALS=1 is set.
 */

import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { getDb, closeDb } from '@/lib/data';
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
      { ok: false, error: 'amountCents must be positive for a withdrawal' },
      { status: 400 },
    );
  }

  const allowNegative = process.env.JARVIS_ALLOW_NEGATIVE_WITHDRAWALS === '1';

  // Balance check: don't let withdrawals take net below zero.
  if (!allowNegative) {
    const db = getDb();
    try {
      const bal = db.jarvis.revenue.balanceCents(projectId);
      const projected = bal.net - amountCents - (feeCents ?? 0);
      if (projected < 0) {
        return NextResponse.json(
          {
            ok: false,
            error: 'insufficient funds',
            detail: {
              currentNetCents: bal.net,
              requestedCents: amountCents + (feeCents ?? 0),
              projectedNetCents: projected,
            },
          },
          { status: 409 },
        );
      }
    } finally {
      closeDb();
    }
  }

  try {
    const revenue = recordLocalFunding({
      projectId,
      amountCents,
      currency: currency ?? 'USD',
      type: 'withdrawal',
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
