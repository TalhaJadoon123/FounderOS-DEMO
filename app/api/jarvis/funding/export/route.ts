/**
 * Export the funding ledger as CSV.
 *
 * GET /api/jarvis/funding/export?projectId=...&source=...
 *
 * Returns text/csv with columns: id,project_id,source,...,net_cents,...,occurred_at
 * plus a TOTALS row.
 *
 * Requires Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN> or x-jarvis-token
 * when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { exportLedgerCsv } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || undefined;
  const source = searchParams.get('source') || undefined;

  try {
    const csv = exportLedgerCsv({ projectId, source });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="jarvis-funding-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
