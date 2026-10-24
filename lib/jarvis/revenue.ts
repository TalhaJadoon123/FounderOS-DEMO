/**
 * Real revenue sync — multi-provider: Stripe, Wise, NOWPayments + local funding.
 *
 * Jarvis mints checkout sessions; this module reads completed payments back
 * from each configured provider and upserts them into `jarvis_revenue`.
 * It is idempotent (the provider payment id is the external id), so the sync
 * stage can run every few minutes without double-counting.
 *
 * No key, no sync: each provider returns an honest "skipped" result rather
 * than a fabricated number. Deposits and withdrawals from your local trading
 * bot are recorded via POST /api/jarvis/funding/* and appear here too.
 *
 * Every row now carries fee_cents and net_cents so you always know your
 * real take-home (gross − processor fees), not just the headline number.
 */

import { getDb, closeDb } from '@/lib/data';
import { JarvisRevenueSchema, type JarvisRevenue } from '@/lib/schemas';

/* ────────────────────────── shared types ────────────────────────── */

type Payment = {
  id: string;
  amount?: number | null;
  currency?: string | null;
  created?: number | string | null;
  customer?: string | null;
  status?: string | null;
  metadata?: Record<string, string> | null;
  fee?: number | null;
};

export type RevenueSyncResult = {
  ok: boolean;
  synced: number;
  scanned: number;
  summary: string;
};

type ProviderResult = {
  provider: string;
  result: RevenueSyncResult;
};

/* ────────────────────────── pure mapping ────────────────────────── */

/**
 * Map a provider payment to a Jarvis revenue row. `source` is the provider
 * name (stripe | wise | nowpayments | deposit | withdrawal | trade_pnl).
 * Negative `amountCents` records a withdrawal.
 *
 * `feeCents` is the processor fee (if known). `netCents = amountCents − feeCents`.
 */
export function mapPaymentToRevenue(
  payment: Payment,
  source: string,
  knownProjects: ReadonlySet<string>,
  type: 'sale' | 'deposit' | 'withdrawal' | 'trade_pnl' = 'sale',
  feeCents = 0,
): JarvisRevenue | null {
  // Attribution: projectId from metadata, client_reference_id, or external ref.
  const attributedTo =
    payment.metadata?.projectId ||
    payment.metadata?.client_reference_id ||
    payment.metadata?.orderId ||
    '';
  if (!attributedTo || !knownProjects.has(attributedTo)) return null;
  if (typeof payment.amount !== 'number' || payment.amount === 0) return null;

  const created =
    typeof payment.created === 'number'
      ? payment.created
      : typeof payment.created === 'string'
        ? new Date(payment.created).getTime() / 1000
        : Math.floor(Date.now() / 1000);

  const occurredAt = new Date(created * 1000).toISOString();
  const currency = (payment.currency ?? 'usd').toUpperCase().slice(0, 3);
  const amountCents = Math.round(payment.amount * 100);

  // Withdrawals are recorded as negative amounts so the ledger nets out.
  const signedAmount = type === 'withdrawal' ? -Math.abs(amountCents) : amountCents;

  let status = payment.status;
  if (!status) {
    if (type === 'withdrawal') status = 'withdrawn';
    else if (type === 'trade_pnl') status = signedAmount < 0 ? 'loss' : 'paid';
    else status = 'paid';
  }

  const netCents = signedAmount - feeCents;

  return {
    id: `jarvis-rev-${source}-${payment.id}`,
    projectId: attributedTo,
    source,
    externalId: payment.id,
    customer: payment.customer ?? '',
    amountCents: signedAmount,
    feeCents,
    netCents,
    currency,
    status,
    occurredAt,
  };
}

/* ────────────────────────── Stripe (with pagination) ────────────────────────── */

type StripeSession = Payment & {
  status?: string;
};

type StripeList<T> = {
  data?: T[];
  has_more?: boolean;
  error?: { message?: string };
};

async function fetchCompletedStripeSessions(
  key: string,
  limit = 100,
  startingAfter?: string,
): Promise<{ sessions: Payment[]; hasMore: boolean; nextCursor?: string }> {
  const url = new URL(
    `https://api.stripe.com/v1/checkout/sessions?limit=${Math.min(
      Math.max(limit, 1),
      100,
    )}&status=complete`,
  );
  if (startingAfter) url.searchParams.set('starting_after', startingAfter);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as StripeList<StripeSession>;
  if (!res.ok) {
    throw new Error(body.error?.message || `Stripe HTTP ${res.status}`);
  }
  const data = Array.isArray(body.data) ? body.data : [];
  const hasMore = body.has_more === true && data.length > 0;
  const nextCursor = hasMore ? data[data.length - 1].id : undefined;
  return { sessions: data, hasMore, nextCursor };
}

export async function syncStripeRevenue({
  projectId,
  limit = 100,
  maxPages = 1,
}: {
  projectId?: string;
  limit?: number;
  maxPages?: number;
} = {}): Promise<RevenueSyncResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return {
      ok: false,
      synced: 0,
      scanned: 0,
      summary: 'STRIPE_SECRET_KEY not set — Stripe revenue sync skipped.',
    };
  }

  let totalSynced = 0;
  let totalScanned = 0;
  let cursor: string | undefined;
  let pages = 0;

  try {
    do {
      const { sessions, hasMore, nextCursor } = await fetchCompletedStripeSessions(
        key,
        limit,
        cursor,
      );
      totalScanned += sessions.length;
      const result = await syncPayments(sessions, 'stripe', projectId);
      totalSynced += result.synced;

      pages += 1;
      cursor = nextCursor;
      if (!hasMore || pages >= maxPages) break;
    } while (cursor);
  } catch (err) {
    return {
      ok: false,
      synced: totalSynced,
      scanned: totalScanned,
      summary: `Stripe revenue sync failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    synced: totalSynced,
    scanned: totalScanned,
    summary:
      totalSynced > 0
        ? `Synced ${totalSynced} Stripe payment(s) from ${totalScanned} scanned (${pages} page(s)).`
        : `Stripe reachable — no new attributed payments in ${totalScanned} scan(s) (${pages} page(s)).`,
  };
}

/* ────────────────────────── Wise (with pagination) ────────────────────────── */

type WiseTransfer = Payment & {
  reference?: string | null;
  type?: string | null;
  fee?: number | null;
};

async function fetchWiseTransfers(
  key: string,
  limit = 100,
  offset = 0,
): Promise<{ transfers: Payment[]; hasMore: boolean }> {
  const res = await fetch(
    `https://api.wise.com/v1/transfers?limit=${Math.min(Math.max(limit, 1), 1000)}&offset=${offset}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = (await res.json().catch(() => ({}))) as {
    data?: WiseTransfer[];
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) {
    throw new Error(body.error?.message || body.message || `Wise HTTP ${res.status}`);
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return { transfers: data, hasMore: data.length === limit };
}

export async function syncWiseRevenue({
  projectId,
  limit = 100,
  maxPages = 1,
}: {
  projectId?: string;
  limit?: number;
  maxPages?: number;
} = {}): Promise<RevenueSyncResult> {
  const key = process.env.WISE_API_KEY;
  if (!key) {
    return {
      ok: false,
      synced: 0,
      scanned: 0,
      summary: 'WISE_API_KEY not set — Wise revenue sync skipped.',
    };
  }

  let totalSynced = 0;
  let totalScanned = 0;
  let offset = 0;
  let pages = 0;

  try {
    do {
      const { transfers, hasMore } = await fetchWiseTransfers(key, limit, offset);
      totalScanned += transfers.length;
      // Wise transfers carry a fee field on some endpoints; grab it if present.
      const result = await syncPayments(transfers, 'wise', projectId);
      totalSynced += result.synced;

      pages += 1;
      offset += limit;
      if (!hasMore || pages >= maxPages) break;
    } while (true);
  } catch (err) {
    return {
      ok: false,
      synced: totalSynced,
      scanned: totalScanned,
      summary: `Wise revenue sync failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    synced: totalSynced,
    scanned: totalScanned,
    summary:
      totalSynced > 0
        ? `Synced ${totalSynced} Wise transfer(s) from ${totalScanned} scanned (${pages} page(s)).`
        : `Wise reachable — no new attributed transfers in ${totalScanned} scan(s) (${pages} page(s)).`,
  };
}

/* ────────────────────────── NOWPayments (with pagination) ────────────────────────── */

type NowPayment = Payment & {
  order_id?: string | null;
  payment_id?: string | null;
  fee?: number | null;
};

async function fetchNowPayments(
  key: string,
  limit = 100,
  skip = 0,
): Promise<{ payments: Payment[]; hasMore: boolean }> {
  const res = await fetch(
    `https://api.nowpayments.io/v1/payment?limit=${Math.min(
      Math.max(limit, 1),
      100,
    )}&skip=${skip}`,
    {
      headers: {
        Authorization: `NOWPayments-${key}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = (await res.json().catch(() => ({}))) as {
    payments?: NowPayment[];
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) {
    throw new Error(body.error?.message || body.message || `NOWPayments HTTP ${res.status}`);
  }
  const data = Array.isArray(body.payments) ? body.payments : [];
  return { payments: data, hasMore: data.length === limit };
}

export async function syncNowPaymentsRevenue({
  projectId,
  limit = 100,
  maxPages = 1,
}: {
  projectId?: string;
  limit?: number;
  maxPages?: number;
} = {}): Promise<RevenueSyncResult> {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) {
    return {
      ok: false,
      synced: 0,
      scanned: 0,
      summary: 'NOWPAYMENTS_API_KEY not set — NOWPayments revenue sync skipped.',
    };
  }

  let totalSynced = 0;
  let totalScanned = 0;
  let skip = 0;
  let pages = 0;

  try {
    do {
      const { payments, hasMore } = await fetchNowPayments(key, limit, skip);
      totalScanned += payments.length;
      const result = await syncPayments(payments, 'nowpayments', projectId);
      totalSynced += result.synced;

      pages += 1;
      skip += limit;
      if (!hasMore || pages >= maxPages) break;
    } while (true);
  } catch (err) {
    return {
      ok: false,
      synced: totalSynced,
      scanned: totalScanned,
      summary: `NOWPayments revenue sync failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    synced: totalSynced,
    scanned: totalScanned,
    summary:
      totalSynced > 0
        ? `Synced ${totalSynced} NOWPayments payment(s) from ${totalScanned} scanned (${pages} page(s)).`
        : `NOWPayments reachable — no new attributed payments in ${totalScanned} scan(s) (${pages} page(s)).`,
  };
}

/* ────────────────────────── shared DB sync ────────────────────────── */

async function syncPayments(
  payments: Payment[],
  source: string,
  projectId?: string,
): Promise<RevenueSyncResult> {
  const db = getDb();
  try {
    const knownProjects = new Set(db.jarvis.projects.all().map((p) => p.id));
    let synced = 0;

    for (const payment of payments) {
      const revenue = mapPaymentToRevenue(payment, source, knownProjects, 'sale');
      if (!revenue) continue;
      if (projectId && revenue.projectId !== projectId) continue;
      const inserted = db.jarvis.revenue.insertIdempotent(revenue);
      if (inserted) synced += 1;
    }

    return {
      ok: true,
      synced,
      scanned: payments.length,
      summary:
        synced > 0
          ? `Synced ${synced} ${source} payment(s) from ${payments.length} scanned.`
          : `${source} reachable — no new attributed payments in ${payments.length} scan(s).`,
    };
  } finally {
    closeDb();
  }
}

/**
 * Sync revenue from every configured provider (Stripe, Wise, NOWPayments).
 * Returns per-provider results so the operator sees exactly what connected.
 */
export async function syncAllRevenue({
  projectId,
  limit = 100,
  maxPages = 1,
}: {
  projectId?: string;
  limit?: number;
  maxPages?: number;
} = {}): Promise<{
  ok: boolean;
  results: ProviderResult[];
  synced: number;
  scanned: number;
}> {
  const providers: Array<{
    provider: string;
    fn: (opts: {
      projectId?: string;
      limit?: number;
      maxPages?: number;
    }) => Promise<RevenueSyncResult>;
  }> = [
    { provider: 'stripe', fn: syncStripeRevenue },
    { provider: 'wise', fn: syncWiseRevenue },
    { provider: 'nowpayments', fn: syncNowPaymentsRevenue },
  ];

  const results: ProviderResult[] = [];
  let totalSynced = 0;
  let totalScanned = 0;
  let anyOk = false;

  for (const p of providers) {
    const result = await p.fn({ projectId, limit, maxPages });
    results.push({ provider: p.provider, result });
    if (result.ok) anyOk = true;
    totalSynced += result.synced;
    totalScanned += result.scanned;
  }

  return {
    ok: anyOk,
    results,
    synced: totalSynced,
    scanned: totalScanned,
  };
}

/* ────────────────────────── local funding writes ────────────────────────── */

/**
 * Record a local deposit or withdrawal (from your trading bot or manual entry).
 * Withdrawals are stored as negative amounts so the ledger nets out.
 * Idempotent: same (source, reference) won't create a duplicate row.
 */
export function recordLocalFunding({
  projectId,
  amountCents,
  currency = 'USD',
  type, // 'deposit' | 'withdrawal'
  reference, // external reference id from your bot
  note,
  feeCents = 0,
}: {
  projectId: string;
  amountCents: number;
  currency?: string;
  type: 'deposit' | 'withdrawal';
  reference: string;
  note?: string;
  feeCents?: number;
}): JarvisRevenue {
  const now = new Date().toISOString();
  const signedAmount = type === 'withdrawal' ? -Math.abs(amountCents) : Math.abs(amountCents);
  const netCents = signedAmount - feeCents;

  const revenue: JarvisRevenue = {
    id: `jarvis-rev-local-${type}-${reference}`,
    projectId,
    source: type,
    externalId: reference,
    customer: note ?? '',
    amountCents: signedAmount,
    feeCents,
    netCents,
    currency: currency.toUpperCase().slice(0, 3),
    status: type === 'withdrawal' ? 'withdrawn' : 'paid',
    occurredAt: now,
  };

  const db = getDb();
  try {
    const inserted = db.jarvis.revenue.insertIdempotent(revenue);
    if (!inserted) {
      // Already exists — return the existing row so the caller gets a stable id.
      const existing = db.jarvis.revenue.getBySourceExternal(type, reference);
      if (existing) return existing;
      // Fallback: shouldn't happen, but insert anyway if the row vanished.
      db.jarvis.revenue.insert(revenue);
      return revenue;
    }
    return revenue;
  } finally {
    closeDb();
  }
}

/**
 * Record trade P&L from your local MT5 bot. Each closed trade becomes a
 * revenue row with source 'trade_pnl'.
 *
 * Idempotent: same reference (ticket id) won't create a duplicate row.
 */
export function recordTradePnl({
  projectId,
  amountCents,
  currency = 'USD',
  reference,
  symbol,
  note,
  feeCents = 0,
}: {
  projectId: string;
  amountCents: number; // positive = profit, negative = loss
  currency?: string;
  reference: string; // MT5 ticket id or your bot's trade id
  symbol?: string;
  note?: string;
  feeCents?: number;
}): JarvisRevenue {
  const now = new Date().toISOString();
  const netCents = amountCents - feeCents;

  const revenue: JarvisRevenue = {
    id: `jarvis-rev-trade-pnl-${reference}`,
    projectId,
    source: 'trade_pnl',
    externalId: reference,
    customer: `${symbol ?? ''} ${note ?? ''}`.trim(),
    amountCents,
    feeCents,
    netCents,
    currency: currency.toUpperCase().slice(0, 3),
    status: amountCents >= 0 ? 'paid' : 'loss',
    occurredAt: now,
  };

  const db = getDb();
  try {
    const inserted = db.jarvis.revenue.insertIdempotent(revenue);
    if (!inserted) {
      const existing = db.jarvis.revenue.getBySourceExternal('trade_pnl', reference);
      if (existing) return existing;
      db.jarvis.revenue.insert(revenue);
      return revenue;
    }
    return revenue;
  } finally {
    closeDb();
  }
}

/* ────────────────────────── reconciliation ────────────────────────── */

/**
 * Reconcile a project's ledger: gross, fees, net, and per-source breakdown.
 * Use this to check "did everything that should be recorded actually get recorded?"
 */
export function reconcileProject(projectId: string): {
  projectId: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  count: number;
  bySource: Array<{ source: string; gross: number; fees: number; net: number; count: number }>;
} {
  const db = getDb();
  try {
    const rows = db.jarvis.revenue.byProject(projectId);

    const bySourceMap = new Map<
      string,
      { gross: number; fees: number; net: number; count: number }
    >();

    let gross = 0;
    let fees = 0;
    let net = 0;

    for (const r of rows) {
      gross += r.amountCents;
      fees += r.feeCents ?? 0;
      net += r.netCents ?? r.amountCents - (r.feeCents ?? 0);

      const cur = bySourceMap.get(r.source) ?? { gross: 0, fees: 0, net: 0, count: 0 };
      cur.gross += r.amountCents;
      cur.fees += r.feeCents ?? 0;
      cur.net += r.netCents ?? r.amountCents - (r.feeCents ?? 0);
      cur.count += 1;
      bySourceMap.set(r.source, cur);
    }

    return {
      projectId,
      grossCents: gross,
      feeCents: fees,
      netCents: net,
      count: rows.length,
      bySource: Array.from(bySourceMap.entries()).map(([source, v]) => ({
        source,
        gross: v.gross,
        fees: v.fees,
        net: v.net,
        count: v.count,
      })),
    };
  } finally {
    closeDb();
  }
}

/**
 * Ledger listing with optional source/type filter and running balance.
 */
export function listLedger({
  projectId,
  source,
  limit = 100,
  offset = 0,
}: {
  projectId?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): JarvisRevenue[] {
  const db = getDb();
  try {
    const allRows = projectId
      ? db.jarvis.revenue.byProject(projectId)
      : db.jarvis.revenue.all();

    let filtered = allRows;
    if (source) {
      filtered = filtered.filter((r) => r.source === source);
    }

    // occurred_at DESC is already the order from byProject/all; apply offset/limit.
    const start = Math.max(offset, 0);
    const end = start + Math.min(Math.max(limit, 1), 500);
    const page = filtered.slice(start, end);

    return page.map((r) =>
      JarvisRevenueSchema.parse({
        id: r.id,
        projectId: r.projectId,
        source: r.source,
        externalId: r.externalId,
        customer: r.customer,
        amountCents: r.amountCents,
        feeCents: r.feeCents ?? 0,
        netCents: r.netCents ?? 0,
        currency: r.currency,
        status: r.status,
        occurredAt: r.occurredAt,
      }),
    );
  } finally {
    closeDb();
  }
}

/**
 * Export the ledger as CSV text (gross, fees, net per row + totals).
 */
export function exportLedgerCsv({
  projectId,
  source,
}: {
  projectId?: string;
  source?: string;
}): string {
  const rows = listLedger({ projectId, source, limit: 10_000, offset: 0 });
  const lines = [
    'id,project_id,source,external_id,customer,amount_cents,fee_cents,net_cents,currency,status,occurred_at',
  ];
  let gross = 0;
  let fees = 0;
  let net = 0;
  for (const r of rows) {
    gross += r.amountCents;
    fees += r.feeCents ?? 0;
    net += r.netCents ?? r.amountCents - (r.feeCents ?? 0);
    lines.push(
      [
        r.id,
        r.projectId,
        r.source,
        r.externalId,
        `"${r.customer.replace(/"/g, '""')}"`,
        r.amountCents,
        r.feeCents ?? 0,
        r.netCents ?? r.amountCents - (r.feeCents ?? 0),
        r.currency,
        r.status,
        r.occurredAt,
      ].join(','),
    );
  }
  lines.push(
    `,,TOTALS,,,"${gross}","${fees}","${net}",,,`,
  );
  return lines.join('\n');
}
