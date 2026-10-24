/**
 * Record a local withdrawal into `jarvis_revenue` (source: 'withdrawal',
 * stored as a negative amount so the ledger nets out).
 *
 * POST /api/jarvis/funding/withdraw
 * Body: { projectId, amountCents, currency?, reference, note? }
 */

import { NextResponse } from 'next/server';
import { recordLocalFunding } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const { projectId, amountCents, currency, reference, note } = body;

  if (!projectId || typeof amountCents !== 'number' || !reference) {
    return NextResponse.json(
      { ok: false, error: 'projectId, amountCents, and reference are required' },
      { status: 400 },
    );
  }

  try {
    const revenue = recordLocalFunding({
      projectId,
      amountCents,
      currency: currency ?? 'USD',
      type: 'withdrawal',
      reference,
      note,
    });
    return NextResponse.json({
      ok: true,
      revenue: {
        id: revenue.id,
        source: revenue.source,
        amountCents: revenue.amountCents,
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
