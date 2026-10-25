process.env.FOUNDER_OS_DB = ':memory:';

import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/finances/bot-sync/route';
import { getDb, closeDb } from '@/lib/data';
import { reconcileProject } from '@/lib/jarvis/revenue';

const PROJECT = 'loopader-bot';

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request('http://localhost/api/finances/bot-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

/** Exactly what the MT5 bridge returns (positions serialized as a JSON string). */
const bridgeAccountStringPositions = {
  success: true,
  account_balance: 10000,
  account_equity: 10500,
  account_margin_free: 9000,
  positions: JSON.stringify([
    {
      ticket: 1,
      symbol: 'EURUSD',
      type: 0,
      volume: '0.10',
      price_open: '1.10000',
      price_current: '1.10500',
      profit: '50.00',
    },
  ]),
};

describe('POST /api/finances/bot-sync', () => {
  const previousToken = process.env.JARVIS_LOCAL_INGEST_TOKEN;

  beforeEach(() => {
    delete process.env.JARVIS_LOCAL_INGEST_TOKEN;
    closeDb();
    getDb();
  });

  afterEach(() => {
    closeDb();
    if (previousToken === undefined) delete process.env.JARVIS_LOCAL_INGEST_TOKEN;
    else process.env.JARVIS_LOCAL_INGEST_TOKEN = previousToken;
  });

  test('records a real MT5 snapshot and positions, and retires seeded rows', async () => {
    const res = await post({
      source: 'loopader',
      account: bridgeAccountStringPositions,
      timestamp: '2026-10-25T10:00:00.000Z',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      snapshot: { recorded: boolean; accountId: string };
      positions: number;
      evicted: { snapshots: number } | null;
    };
    expect(json.snapshot.recorded).toBe(true);
    expect(json.snapshot.accountId).toBe(PROJECT);
    expect(json.positions).toBe(1);

    const db = getDb();
    const snapshots = db.trading.latestSnapshots();
    const live = snapshots.find((s) => s.accountId === PROJECT);
    expect(live).toBeDefined();
    expect(live?.source).toBe('loopader');
    expect(live?.accountValueUsd).toBe(10500);
    expect(live?.cashUsd).toBe(10000);
    expect(live?.buyingPowerUsd).toBe(9000);
    expect(live?.totalPnlUsd).toBe(500); // equity - balance

    const positions = db.trading.positions();
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('EURUSD');
    expect(positions[0].quantity).toBeCloseTo(0.1);
    expect(positions[0].unrealizedPnlUsd).toBe(50);

    // Seeded demo rows must not sit in front of the live series.
    expect(snapshots.filter((s) => s.source === 'seed')).toHaveLength(0);
    expect(db.jarvis.projects.all().some((p) => p.id === PROJECT)).toBe(true);
  });

  test('accepts the bridge array shape and top-level account fields', async () => {
    const res = await post({
      source: 'loopader',
      account_balance: 500,
      account_equity: 550,
      positions: [
        {
          symbol: 'XAUUSD',
          volume: 0.2,
          price_open: 1900,
          price_current: 1910,
          profit: 20,
        },
      ],
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const live = db.trading.latestSnapshots().find((s) => s.accountId === PROJECT);
    expect(live?.accountValueUsd).toBe(550);
    expect(db.trading.positions()[0].symbol).toBe('XAUUSD');
  });

  test('writes trades to the funding ledger with fees, idempotently', async () => {
    const payload = {
      source: 'loopader',
      account: bridgeAccountStringPositions,
      trades: [{ ticket: 'T-1', symbol: 'EURUSD', profit: 12.5, commission: 0.5 }],
    };

    const first = await post(payload);
    expect(first.status).toBe(200);
    let rec = reconcileProject(PROJECT);
    expect(rec.count).toBe(1);
    expect(rec.grossCents).toBe(1250);
    expect(rec.feeCents).toBe(50);
    expect(rec.netCents).toBe(1200);

    // A replayed sync must not double-count the same ticket.
    const second = await post(payload);
    expect(second.status).toBe(200);
    rec = reconcileProject(PROJECT);
    expect(rec.count).toBe(1);
    expect(rec.grossCents).toBe(1250);
  });

  test('is honest when the account has no balance/equity value', async () => {
    const res = await post({ source: 'loopader', account: { positions: [] } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      snapshot: { recorded: boolean; error?: string };
    };
    expect(json.snapshot.recorded).toBe(false);
    expect(json.snapshot.error).toContain('account_balance');
  });

  test('rejects invalid JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/finances/bot-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(res.status).toBe(400);
  });

  test('requires the ingest token when configured', async () => {
    process.env.JARVIS_LOCAL_INGEST_TOKEN = 'test-ingest-token';

    const denied = await post({ source: 'loopader', account: bridgeAccountStringPositions });
    expect(denied.status).toBe(401);

    const wrong = await post(
      { source: 'loopader', account: bridgeAccountStringPositions },
      { authorization: 'Bearer nope' },
    );
    expect(wrong.status).toBe(401);

    const allowed = await post(
      { source: 'loopader', account: bridgeAccountStringPositions },
      { authorization: 'Bearer test-ingest-token' },
    );
    expect(allowed.status).toBe(200);
  });
});
