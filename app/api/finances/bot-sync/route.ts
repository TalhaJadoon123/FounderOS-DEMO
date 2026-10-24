import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { recordTradePnl } from '@/lib/jarvis/revenue';
import { getDb, closeDb } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Bot sync — your trading bot POSTs account snapshot + closed trades here.
 * Compatible with Loopader CLI and MCP formats.
 *
 * POST /api/finances/bot-sync
 * Body: { source, account: {...}, trades?: [...] }
 *
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

  const { source, trades } = body;
  let account = body.account;
  const projectId = body.projectId || (source ? `bot-${source}` : 'loopader-bot');

  // Auto-create project
  const db = getDb();
  try {
    const projects = db.jarvis.projects.all();
    if (!projects.find((p) => p.id === projectId)) {
      const now = new Date().toISOString();
      db.jarvis.projects.upsert({
        id: projectId,
        name: source ? `${source} Bot` : 'Loopader Bot',
        repo: '',
        branch: 'main',
        deployUrl: '',
        healthUrl: '',
        checkoutUrl: '',
        stripePriceId: '',
        deployHookEnv: 'VERCEL_DEPLOY_HOOK_URL',
        localPath: '',
        verifyCommand: '',
        priceCents: 0,
        currency: 'USD',
        status: 'active',
        autonomy: 'assisted',
        health: 'unknown',
        createdAt: now,
        updatedAt: now,
        lastRunAt: null,
      } as any);
    }
  } catch (e) {
    // ignore
  } finally {
    closeDb();
  }

  // Normalize account
  if (!account && body.account_balance !== undefined) {
    account = {
      account_id: body.account_id || projectId,
      account_label: body.account_label || 'Loopader',
      account_balance: body.account_balance,
      account_equity: body.account_equity,
      margin_free: body.account_margin_free,
    };
  }

  const results: Array<{ ok: boolean; reference?: string; error?: string }> = [];

  if (Array.isArray(trades)) {
    for (const t of trades) {
      if (!t || typeof t.amountCents !== 'number' || !t.reference) {
        // Try to convert
        if (t && typeof t.pnl !== 'number' && typeof t.profit !== 'number') {
          results.push({ ok: false, error: 'invalid trade entry' });
          continue;
        }
        const pnl = t.pnl ?? t.profit ?? 0;
        const ref = t.reference || t.ticket || t.id || `trade-${Date.now()}`;
        try {
          recordTradePnl({
            projectId,
            amountCents: Math.round(pnl * 100),
            currency: t.currency ?? 'USD',
            reference: ref,
            symbol: t.symbol,
            note: t.note ?? `${source || 'loopader'} trade`,
            feeCents: t.feeCents ?? 0,
          });
          results.push({ ok: true, reference: ref });
        } catch (err) {
          results.push({
            ok: false,
            reference: ref,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }
      try {
        recordTradePnl({
          projectId,
          amountCents: t.amountCents,
          currency: t.currency ?? 'USD',
          reference: t.reference,
          symbol: t.symbol,
          note: t.note ?? `${source || 'loopader'} trade`,
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
    success: true,
    source,
    account: account
      ? {
          accountId: account.account_id || account.id,
          balance: account.account_balance || account.balance,
          equity: account.account_equity || account.equity,
        }
      : null,
    trades: results,
  });
}
