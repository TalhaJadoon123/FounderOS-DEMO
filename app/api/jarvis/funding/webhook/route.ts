/**
 * Trade P&L webhook — your local MT5 bot POSTs here when a trade closes.
 *
 * POST /api/jarvis/funding/webhook
 * Body: { projectId, amountCents, currency?, reference, symbol?, note? }
 *
 * amountCents: positive = profit, negative = loss
 * reference: MT5 ticket id or your bot's trade id
 *
 * Records into `jarvis_revenue` with source 'trade_pnl'. Local-only — your
 * bot posts here directly, nothing touches the public internet.
 */

import { NextResponse } from 'next/server';
import { recordTradePnl } from '@/lib/jarvis/revenue';

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
  const { projectId, amountCents, currency, reference, symbol, note } = body;

  if (!projectId || typeof amountCents !== 'number' || !reference) {
    return NextResponse.json(
      { ok: false, error: 'projectId, amountCents, and reference are required' },
      { status: 400 },
    );
  }

  try {
    const revenue = recordTradePnl({
      projectId,
      amountCents,
      currency: currency ?? 'USD',
      reference,
      symbol,
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
