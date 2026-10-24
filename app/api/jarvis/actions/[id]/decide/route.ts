/**
 * Decide a pending Jarvis action.
 *
 * POST /api/jarvis/actions/[id]/decide   { decision: 'approve' | 'reject' }
 */

import { NextResponse } from 'next/server';
import { getDb, closeDb } from '@/lib/data';
import { executeAction } from '@/lib/jarvis/executor';
import { killSwitchActive } from '@/lib/jarvis/policy';
import type { JarvisActionStatus } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { decision: 'approve' | 'reject' };
  const decision = body.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be approve or reject' }, { status: 400 });
  }

  const db = getDb();
  try {
    const actions = db.jarvis.actions.pending();
    const action = actions.find((a) => a.id === id);
    if (!action) {
      return NextResponse.json({ error: 'action not found or not pending' }, { status: 404 });
    }

    if (decision === 'reject') {
      db.jarvis.actions.decide(id, 'rejected');
      return NextResponse.json({ action: { ...action, status: 'rejected' as JarvisActionStatus } });
    }

    if (killSwitchActive(db.jarvis.settings.get('killSwitchIntent'))) {
      return NextResponse.json({ error: 'Jarvis is paused by the kill switch. Clear it before approving.' }, { status: 409 });
    }

    // Approve: execute the action now.
    try {
      const result = await executeAction({ kind: action.kind, payload: action.payload });
      const status = result.ok ? ('executed' as JarvisActionStatus) : ('failed' as JarvisActionStatus);
      db.jarvis.actions.decide(id, status);

      // If it was a checkout that created a URL, stash it back on the project.
      if (result.ok && action.kind === 'checkout' && result.checkoutUrl && action.projectId) {
        const { JarvisProjectSchema } = await import('@/lib/schemas');
        const projects = db.jarvis.projects.all();
        const proj = projects.find((p) => p.id === action.projectId);
        if (proj) {
          const updated = {
            ...proj,
            checkoutUrl: result.checkoutUrl,
            updatedAt: new Date().toISOString(),
          };
          db.jarvis.projects.upsert(JarvisProjectSchema.parse(updated));
        }
      }

      return NextResponse.json({ action: { ...action, status }, result });
    } catch (err) {
      db.jarvis.actions.decide(id, 'failed');
      return NextResponse.json(
        { action: { ...action, status: 'failed' as JarvisActionStatus }, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  } finally {
    closeDb();
  }
}
