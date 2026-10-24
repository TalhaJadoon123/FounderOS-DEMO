/**
 * Ledger listing — all funding/revenue rows for a project (or all projects).
 *
 * GET /api/jarvis/funding/ledger?projectId=...&source=...&limit=...&offset=...
 *
 * Requires Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN> or x-jarvis-token
 * when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { listLedger } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || undefined;
  const source = searchParams.get('source') || undefined;
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 500);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  try {
    const rows = listLedger({ projectId, source, limit, offset });
    return NextResponse.json({
      ok: true,
      count: rows.length,
      ledger: rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        source: r.source,
        externalId: r.externalId,
        customer: r.customer,
        amountCents: r.amountCents,
        feeCents: r.feeCents,
        netCents: r.netCents,
        currency: r.currency,
        status: r.status,
        occurredAt: r.occurredAt,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
