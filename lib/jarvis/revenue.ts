/**
 * Real revenue sync — multi-provider: Stripe, Wise, NOWPayments.
 *
 * Jarvis mints checkout sessions; this module reads completed payments back
 * from each configured provider and upserts them into `jarvis_revenue`.
 * It is idempotent (the provider payment id is the external id), so the sync
 * stage can run every few minutes without double-counting.
 *
 * No key, no sync: each provider returns an honest "skipped" result rather
 * than a fabricated number. Deposits and withdrawals from your local trading
 * bot are recorded via POST /api/jarvis/funding/* and appear here too.
 */

import { getDb, closeDb } from '@/lib/data';
import type { JarvisRevenue } from '@/lib/schemas';

/* ────────────────────────── shared types ────────────────────────── */

type Payment = {
  id: string;
  amount?: number | null;
  currency?: string | null;
  created?: number | string | null;
  customer?: string | null;
  status?: string | null;
  metadata?: Record<string, string> | null;
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
 */
export function mapPaymentToRevenue(
  payment: Payment,
  source: string,
  knownProjects: ReadonlySet<string>,
  type: 'sale' | 'deposit' | 'withdrawal' | 'trade_pnl' = 'sale',
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

  return {
    id: `jarvis-rev-${source}-${payment.id}`,
    projectId: attributedTo,
    source,
    externalId: payment.id,
    customer: payment.customer ?? '',
    amountCents: signedAmount,
    currency,
    status,
    occurredAt,
  };
}

/* ────────────────────────── Stripe ────────────────────────── */

type StripeSession = Payment & {
  status?: string;
};

type StripeList<T> = {
  data?: T[];
  has_more?: boolean;
  error?: { message?: string };
};

async function fetchCompletedStripeSessions(key: string, limit = 100): Promise<Payment[]> {
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions?limit=${Math.min(Math.max(limit, 1), 100)}&status=complete`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = (await res.json().catch(() => ({}))) as StripeList<StripeSession>;
  if (!res.ok) {
    throw new Error(body.error?.message || `Stripe HTTP ${res.status}`);
  }
  return Array.isArray(body.data) ? body.data : [];
}

export async function syncStripeRevenue({
  projectId,
  limit = 100,
}: {
  projectId?: string;
  limit?: number;
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

  let sessions: Payment[];
  try {
    sessions = await fetchCompletedStripeSessions(key, limit);
  } catch (err) {
    return {
      ok: false,
      synced: 0,
      scanned: 0,
      summary: `Stripe revenue sync failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return syncPayments(sessions, 'stripe', projectId);
}

/* ────────────────────────── Wise ────────────────────────── */

type WiseTransfer = Payment & {
  reference?: string | null;
  type?: string | null;
};

async function fetchWiseTransfers(key: string, limit = 100): Promise<Payment[]> {
  const res = await fetch(
    `https://api.wise.com/v1/transfers?limit=${Math.min(Math.max(limit, 1), 1000)}`,
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
  return Array.isArray(body.data) ? body.data : [];
}

export async function syncWiseRevenue({
  projectId,
  limit = 100,
}: {
  projectId?: string;
  limit?: number;
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

  let transfers: Payment[];
  try {
    transfers = await fetchWiseTransfers(key, limit);
  } catch (err) {
    return {
      ok: false,
      synced: 0,
      scanned: 0,
      summary: `Wise revenue sync failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return syncPayments(transfers, 'wise', projectId);
}

/* ────────────────────────── NOWPayments ────────────────────────── */

type NowPayment = Payment & {
  order_id?: string | null;
  payment_id?: string | null;
};

async function fetchNowPayments(key: string, limit = 100): Promise<Payment[]> {
  const res = await fetch(
    `https://api.nowpayments.io/v1/payment?limit=${Math.min(Math.max(limit, 1), 100)}`,
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
  return Array.isArray(body.payments) ? body.payments : [];
}

export async function syncNowPaymentsRevenue({
  projectId,
  limit = 100,
}: {
  projectId?: string;
  limit?: number;
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

  let payments: Payment[];
  try {
    payments = await fetchNowPayments(key, limit);
  } catch (err) {
    return {
      ok: false,
      synced: 0,
      scanned: 0,
      summary: `NOWPayments revenue sync failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return syncPayments(payments, 'nowpayments', projectId);
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
      const revenue = mapPaymentToRevenue(payment, source, knownProjects);
      if (!revenue) continue;
      if (projectId && revenue.projectId !== projectId) continue;
      db.jarvis.revenue.insert(revenue);
      synced += 1;
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
}: {
  projectId?: string;
  limit?: number;
} = {}): Promise<{
  ok: boolean;
  results: ProviderResult[];
  synced: number;
  scanned: number;
}> {
  const providers: Array<{
    provider: string;
    fn: (opts: { projectId?: string; limit?: number }) => Promise<RevenueSyncResult>;
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
    const result = await p.fn({ projectId, limit });
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

/**
 * Record a local deposit or withdrawal (from your trading bot or manual entry).
 * Withdrawals are stored as negative amounts so the ledger nets out.
 */
export function recordLocalFunding({
  projectId,
  amountCents,
  currency = 'USD',
  type, // 'deposit' | 'withdrawal'
  reference, // external reference id from your bot
  note,
}: {
  projectId: string;
  amountCents: number;
  currency?: string;
  type: 'deposit' | 'withdrawal';
  reference: string;
  note?: string;
}): JarvisRevenue {
  const now = new Date().toISOString();
  const signedAmount = type === 'withdrawal' ? -Math.abs(amountCents) : Math.abs(amountCents);

  const revenue: JarvisRevenue = {
    id: `jarvis-rev-local-${type}-${reference}`,
    projectId,
    source: type,
    externalId: reference,
    customer: note ?? '',
    amountCents: signedAmount,
    currency: currency.toUpperCase().slice(0, 3),
    status: type === 'withdrawal' ? 'withdrawn' : 'paid',
    occurredAt: now,
  };

  const db = getDb();
  try {
    db.jarvis.revenue.insert(revenue);
  } finally {
    closeDb();
  }

  return revenue;
}

/**
 * Record trade P&L from your local MT5 bot. Each closed trade becomes a
 * revenue row with source 'trade_pnl'.
 */
export function recordTradePnl({
  projectId,
  amountCents,
  currency = 'USD',
  reference,
  symbol,
  note,
}: {
  projectId: string;
  amountCents: number; // positive = profit, negative = loss
  currency?: string;
  reference: string; // MT5 ticket id or your bot's trade id
  symbol?: string;
  note?: string;
}): JarvisRevenue {
  const now = new Date().toISOString();

  const revenue: JarvisRevenue = {
    id: `jarvis-rev-trade-pnl-${reference}`,
    projectId,
    source: 'trade_pnl',
    externalId: reference,
    customer: `${symbol ?? ''} ${note ?? ''}`.trim(),
    amountCents,
    currency: currency.toUpperCase().slice(0, 3),
    status: amountCents >= 0 ? 'paid' : 'loss',
    occurredAt: now,
  };

  const db = getDb();
  try {
    db.jarvis.revenue.insert(revenue);
  } finally {
    closeDb();
  }

  return revenue;
}
