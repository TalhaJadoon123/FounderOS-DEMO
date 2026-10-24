/**
 * Trade P&L webhook — your local MT5 bot POSTs here when a trade closes.
 *
 * POST /api/jarvis/funding/webhook
 * Body (single): { projectId, amountCents, currency?, reference, symbol?, note?, feeCents? }
 * Body (batch):  { trades: [ { projectId, amountCents, currency?, reference, symbol?, note?, feeCents? }, ... ] }
 *
 * amountCents: positive = profit, negative = loss
 * reference: MT5 ticket id or your bot's trade id (must be unique per trade)
 *
 * Records into `jarvis_revenue` with source 'trade_pnl'. Idempotent: the same
 * reference won't create a duplicate row.
 *
 * Requires Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN> or x-jarvis-token
 * when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { recordTradePnl } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

type TradeInput = {
  projectId: string;
  amountCents: number;
  currency?: string;
  reference: string;
  symbol?: string;
  note?: string;
  feeCents?: number;
};

function validateTrade(t: TradeInput): string | null {
  if (!t.projectId) return 'projectId is required';
  if (typeof t.amountCents !== 'number') return 'amountCents is required';
  if (!t.reference) return 'reference is required';
  return null;
}

export async function POST(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const trades: TradeInput[] = body.trades
    ? Array.isArray(body.trades)
      ? body.trades
      : [body.trades]
    : [body];

  if (trades.length === 0) {
    return NextResponse.json({ ok: false, error: 'no trades provided' }, { status: 400 });
  }

  const errors: string[] = [];
  const recorded: Array<{ ok: boolean; reference?: string; error?: string; revenue?: any }> = [];

  for (const t of trades) {
    const v = validateTrade(t);
    if (v) {
      errors.push(v);
      recorded.push({ ok: false, error: v });
      continue;
    }

    try {
      const revenue = recordTradePnl({
        projectId: t.projectId,
        amountCents: t.amountCents,
        currency: t.currency ?? 'USD',
        reference: t.reference,
        symbol: t.symbol,
        note: t.note,
        feeCents: t.feeCents ?? 0,
      });
      recorded.push({
        ok: true,
        reference: t.reference,
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
      recorded.push({
        ok: false,
        reference: t.reference,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ok = errors.length === 0;
  return NextResponse.json(
    {
      ok,
      recorded: recorded.length,
      accepted: recorded.filter((r) => r.ok).length,
      rejected: recorded.filter((r) => !r.ok).length,
      details: recorded,
      ...(errors.length ? { errors } : {}),
    },
    { status: ok ? 200 : 207 }, // 207 Multi-Status if some failed
  );
}
