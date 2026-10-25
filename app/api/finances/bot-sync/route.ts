import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { recordTradePnl } from '@/lib/jarvis/revenue';
import { getDb } from '@/lib/data';
import {
  TradingAccountSnapshotSchema,
  TradingPositionSchema,
  type TradingAccountSnapshot,
  type TradingPosition,
} from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Bot sync — a trading bot POSTs its live account snapshot (and optional
 * closed trades) here. Compatible with the Loopader CLI, the MCP server, and
 * the generic MT5 bridge shape.
 *
 * POST /api/finances/bot-sync
 * Body: { source, account: {...}, trades?: [...], projectId?, capturedAt? }
 *
 * The account snapshot is normalized into trading_snapshots/positions, which
 * is exactly what `/trading` reads — so the first real sync retires the demo
 * rows instead of leaving the page on seeded data. Trades are written to the
 * funding ledger as trade_pnl rows (idempotent by ticket/reference).
 *
 * Requires ingest auth when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/** The MT5 bridge emits `positions` as an array; some clients serialize it as
 *  a JSON string. Accept both, and never let a malformed string fail the sync. */
function positionsArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildSnapshot(
  account: JsonObject,
  source: string,
  projectId: string,
  capturedAt: string,
): { snapshot: TradingAccountSnapshot | null; error?: string } {
  const accountId =
    firstString(account.account_id, account.accountId, account.id, account.login) ?? projectId;
  const accountLabel =
    firstString(account.account_label, account.accountLabel, account.label, account.name) ??
    (source === 'loopader' ? 'Loopader MT5' : `${source} account`);

  const equity = firstNumber(
    account.account_equity,
    account.equity,
    account.accountValueUsd,
    account.balance,
    account.account_balance,
  );
  const balance = firstNumber(
    account.account_balance,
    account.balance,
    account.cashUsd,
    account.account_equity,
    account.equity,
  );
  const accountValue = equity ?? balance;
  if (accountValue === null) {
    return {
      snapshot: null,
      error: 'account has no balance/equity value (expected account_balance or account_equity)',
    };
  }

  const buyingPower =
    firstNumber(
      account.account_margin_free,
      account.margin_free,
      account.marginFree,
      account.buyingPowerUsd,
    ) ?? accountValue;
  const cash = balance ?? accountValue;
  const dayPnl = firstNumber(account.day_pnl, account.dayPnl, account.dayPnlUsd) ?? 0;
  const totalPnl =
    firstNumber(account.total_pnl, account.totalPnl, account.totalPnlUsd, account.profit) ??
    (equity !== null && balance !== null ? equity - balance : 0);

  const parsed = TradingAccountSnapshotSchema.safeParse({
    capturedAt,
    accountId,
    accountLabel,
    accountValueUsd: accountValue,
    buyingPowerUsd: buyingPower,
    cashUsd: cash,
    dayPnlUsd: dayPnl,
    totalPnlUsd: totalPnl,
    source,
  });
  return parsed.success ? { snapshot: parsed.data } : { snapshot: null, error: parsed.error.message };
}

function buildPositions(
  account: JsonObject,
  accountId: string,
  capturedAt: string,
): TradingPosition[] {
  const positions: TradingPosition[] = [];
  for (const raw of positionsArray(account.positions)) {
    if (!isObject(raw)) continue;
    const symbol = firstString(raw.symbol, raw.ticker);
    if (!symbol) continue;

    const quantity = firstNumber(raw.volume, raw.quantity, raw.qty) ?? 0;
    const avgCost = firstNumber(raw.price_open, raw.avgCostUsd, raw.avg_cost, raw.open_price) ?? 0;
    const currentPrice =
      firstNumber(raw.price_current, raw.current_price, raw.marketPrice, raw.market_price) ??
      avgCost;
    const marketValue =
      firstNumber(raw.market_value, raw.marketValueUsd) ?? quantity * currentPrice;
    const unrealized =
      firstNumber(raw.profit, raw.unrealizedPnlUsd, raw.unrealized_pnl, raw.unrealizedPnl) ?? 0;

    const parsed = TradingPositionSchema.safeParse({
      capturedAt,
      accountId,
      symbol,
      quantity,
      avgCostUsd: avgCost,
      marketValueUsd: marketValue,
      unrealizedPnlUsd: unrealized,
    });
    if (parsed.success) positions.push(parsed.data);
  }
  return positions;
}

export async function POST(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  if (!isObject(body)) {
    return NextResponse.json({ ok: false, error: 'body must be a JSON object' }, { status: 400 });
  }

  const source = firstString(body.source) ?? 'loopader';
  const projectId =
    firstString(body.projectId) ?? (source === 'loopader' ? 'loopader-bot' : `bot-${source}`);
  const capturedAt =
    firstString(body.capturedAt, body.captured_at, body.timestamp) ?? new Date().toISOString();

  // The bridge response may be sent directly as `account`, or the caller may
  // spread the account fields at the top level. Support both.
  const account = isObject(body.account) ? body.account : body;
  const db = getDb();

  // Auto-create the project so the ledger and /jarvis have somewhere to file
  // the bot's money. Never overwrite an operator-edited project.
  if (!db.jarvis.projects.all().some((project) => project.id === projectId)) {
    const now = new Date().toISOString();
    db.jarvis.projects.upsert({
      id: projectId,
      name: source === 'loopader' ? 'Loopader MT5 Bot' : `${source} trading bot`,
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
      status: 'live',
      autonomy: 'assisted',
      health: 'unknown',
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
    });
  }

  const { snapshot, error: snapshotError } = buildSnapshot(account, source, projectId, capturedAt);
  const positions = snapshot ? buildPositions(account, snapshot.accountId, capturedAt) : [];
  let evicted: { snapshots: number; positions: number; activity: number } | null = null;
  if (snapshot) {
    db.trading.recordSnapshot(snapshot, positions);
    // The first real push retires the demo: seeded rows would otherwise sit in
    // front of the live series and draw a fake cliff on the sleeve graph.
    evicted = db.trading.evictSeeded();
  }

  const tradeResults: Array<{ reference: string; recorded: boolean; error?: string }> = [];
  const rawTrades = Array.isArray(body.trades) ? body.trades : [];
  for (const [index, raw] of rawTrades.entries()) {
    if (!isObject(raw)) {
      tradeResults.push({ reference: `#${index}`, recorded: false, error: 'trade must be an object' });
      continue;
    }

    const reference =
      firstString(raw.reference, raw.ticket, raw.id, raw.order) ?? `${projectId}-${capturedAt}-${index}`;
    const amountCents = firstNumber(raw.amountCents);
    const profit = firstNumber(raw.pnl, raw.profit);
    const cents = amountCents ?? (profit === null ? null : Math.round(profit * 100));
    if (cents === null) {
      tradeResults.push({
        reference,
        recorded: false,
        error: 'trade needs amountCents or pnl/profit',
      });
      continue;
    }

    const commission = firstNumber(raw.commission);
    const feeCents =
      firstNumber(raw.feeCents) ?? (commission === null ? 0 : Math.round(commission * 100));
    const symbol = firstString(raw.symbol, raw.ticker) ?? undefined;
    const note = firstString(raw.note, raw.comment) ?? undefined;
    recordTradePnl({
      projectId,
      amountCents: Math.round(cents),
      currency: firstString(raw.currency) ?? 'USD',
      reference,
      symbol,
      note,
      feeCents: Math.round(feeCents),
    });
    tradeResults.push({ reference, recorded: true });
  }

  return NextResponse.json({
    ok: true,
    source,
    projectId,
    capturedAt,
    snapshot: snapshot
      ? { recorded: true, accountId: snapshot.accountId, accountLabel: snapshot.accountLabel }
      : { recorded: false, error: snapshotError ?? 'no account snapshot' },
    positions: positions.length,
    trades: tradeResults,
    evicted,
  });
}
