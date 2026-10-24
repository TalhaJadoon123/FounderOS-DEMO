/**
 * Real revenue sync — Stripe is the source of truth.
 *
 * Jarvis mints checkout sessions with `metadata.projectId`; this module reads
 * completed sessions back from Stripe and upserts them into `jarvis_revenue`.
 * It is idempotent (the Stripe session id is the external id), so the report
 * stage can run every few minutes without double-counting.
 *
 * No key, no sync: the caller gets an honest "skipped" result rather than a
 * fabricated number.
 */

import { getDb, closeDb } from '@/lib/data';
import type { JarvisRevenue } from '@/lib/schemas';

type StripeSession = {
  id: string;
  amount_total?: number | null;
  currency?: string | null;
  created?: number;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
  status?: string;
};

type StripeList<T> = {
  data?: T[];
  has_more?: boolean;
  error?: { message?: string };
};

export type RevenueSyncResult = {
  ok: boolean;
  synced: number;
  scanned: number;
  summary: string;
};

/**
 * Pure mapping from a Stripe session to a ledger row. Returns null when the
 * session has no project attribution, no positive amount, or points at a
 * project we do not know. Exported so the attribution rules are testable
 * without touching Stripe or SQLite.
 */
export function mapSessionToRevenue(
  session: StripeSession,
  knownProjects: ReadonlySet<string>,
): JarvisRevenue | null {
  const attributedTo = session.metadata?.projectId || session.client_reference_id || '';
  if (!attributedTo || !knownProjects.has(attributedTo)) return null;
  if (typeof session.amount_total !== 'number' || session.amount_total <= 0) return null;
  const occurredAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const currency = (session.currency ?? 'usd').toUpperCase().slice(0, 3);
  return {
    id: `jarvis-rev-${session.id}`,
    projectId: attributedTo,
    source: 'stripe',
    externalId: session.id,
    customer: session.customer_details?.email ?? '',
    amountCents: session.amount_total,
    currency,
    status: 'paid',
    occurredAt,
  };
}

/** Fetch one page of completed checkout sessions from Stripe. */
async function fetchCompletedSessions(key: string, limit = 100): Promise<StripeSession[]> {
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

/**
 * Pull completed Stripe checkout sessions into the local revenue ledger.
 * Only sessions carrying a `projectId` (set by Jarvis when it minted the
 * session) are attributed; anything else is counted as scanned but skipped.
 */
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
      summary: 'STRIPE_SECRET_KEY not set — revenue sync skipped.',
    };
  }

  let sessions: StripeSession[];
  try {
    sessions = await fetchCompletedSessions(key, limit);
  } catch (err) {
    return {
      ok: false,
      synced: 0,
      scanned: 0,
      summary: `Stripe revenue sync failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const db = getDb();
  try {
    const knownProjects = new Set(db.jarvis.projects.all().map((p) => p.id));
    let synced = 0;

    for (const session of sessions) {
      const revenue = mapSessionToRevenue(session, knownProjects);
      if (!revenue) continue;
      if (projectId && revenue.projectId !== projectId) continue;
      db.jarvis.revenue.insert(revenue);
      synced += 1;
    }

    return {
      ok: true,
      synced,
      scanned: sessions.length,
      summary:
        synced > 0
          ? `Synced ${synced} paid Stripe session(s) from ${sessions.length} scanned.`
          : `Stripe reachable — no new attributed payments in ${sessions.length} session(s).`,
    };
  } finally {
    closeDb();
  }
}
