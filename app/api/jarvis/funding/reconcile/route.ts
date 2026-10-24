/**
 * Reconciliation — per-project ledger summary: gross, fees, net, by source.
 *
 * GET /api/jarvis/funding/reconcile?projectId=...
 *
 * Use this to answer "how much did I actually take home?" and to spot gaps
 * between what your bot reports and what's recorded here.
 *
 * Requires Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN> or x-jarvis-token
 * when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { reconcileProject } from '@/lib/jarvis/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: 'projectId is required' },
      { status: 400 },
    );
  }

  try {
    const rec = reconcileProject(projectId);
    return NextResponse.json({
      ok: true,
      reconciliation: {
        projectId: rec.projectId,
        grossCents: rec.grossCents,
        feeCents: rec.feeCents,
        netCents: rec.netCents,
        count: rec.count,
        bySource: rec.bySource,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
