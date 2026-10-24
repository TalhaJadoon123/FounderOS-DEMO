import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { recordTradePnl, recordLocalFunding } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Bot sync — your trading bot POSTs account snapshot + closed trades here.
 *
 * POST /api/finances/bot-sync
 * Body: { source, account: { account_id, account_label, balance, equity, ... }, trades?: [...] }
 *
 * Records each trade as trade_pnl revenue and the account balance as context.
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

  const { source, account, trades } = body;
  const projectId = body.projectId || (source ? `bot-${source}` : 'bot-default');

  const results: Array<{ ok: boolean; reference?: string; error?: string }> = [];

  if (Array.isArray(trades)) {
    for (const t of trades) {
      if (!t || typeof t.amountCents !== 'number' || !t.reference) {
        results.push({ ok: false, error: 'invalid trade entry' });
        continue;
      }
      try {
        recordTradePnl({
          projectId,
          amountCents: t.amountCents,
          currency: t.currency ?? 'USD',
          reference: t.reference,
          symbol: t.symbol,
          note: t.note ?? `${source} trade`,
          feeCents: t.feeCents ?? 0,
        });
        results.push({ ok: true, reference: t.reference });
      } catch (err) {
        results.push({
          ok: false,
          reference: t.reference,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    source,
    account: account ? { accountId: account.account_id, balance: account.balance, equity: account.equity } : null,
    trades: results,
  });
}
