/**
 * Jarvis pending actions (approvals queue).
 *
 * GET    /api/jarvis/actions        — list pending actions
 * POST   /api/jarvis/actions        — create a proposed action (orchestrator does this internally too)
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, closeDb } from '@/lib/data';
import { type JarvisAction } from '@/lib/schemas';
import { killSwitchActive, verdictFor } from '@/lib/jarvis/policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  try {
    const actions = db.jarvis.actions.pending();
    return NextResponse.json({ actions });
  } finally {
    closeDb();
  }
}

export async function POST(req: Request) {
  const db = getDb();
  try {
    if (killSwitchActive(db.jarvis.settings.get('killSwitchIntent'))) {
      return NextResponse.json({ error: 'Jarvis is paused by the kill switch.' }, { status: 409 });
    }
    const body = await req.json();
    const { projectId, kind, title, risk, payload, autonomy, health } = body as {
      projectId: string;
      kind: string;
      title: string;
      risk: 'low' | 'medium' | 'high';
      payload?: Record<string, unknown>;
      autonomy?: string;
      health?: string;
    };

    const amountCents = typeof payload?.amountCents === 'number' ? payload.amountCents : undefined;
    const policy = verdictFor({
      autonomy: (autonomy ?? 'assisted') as any,
      kind: kind as any,
      risk,
      amountCents,
      health,
    });

    const action: JarvisAction = {
      id: body.id || `jarvis-action-${randomUUID()}`,
      projectId,
      runId: body.runId || null,
      kind: kind as any,
      title,
      risk,
      status: policy.ok ? 'executed' : 'pending',
      payload: payload || {},
      createdAt: new Date().toISOString(),
      decidedAt: policy.ok ? new Date().toISOString() : null,
    };

    db.jarvis.actions.insert(action);

    // If policy cleared it, execute immediately.
    if (policy.ok) {
      try {
        const { executeAction } = await import('@/lib/jarvis/executor');
        const result = await executeAction({ kind: action.kind, payload: action.payload });
        db.jarvis.actions.decide(action.id, result.ok ? 'executed' : 'failed');
        return NextResponse.json({ action, executed: true, result });
      } catch (err) {
        db.jarvis.actions.decide(action.id, 'failed');
        return NextResponse.json(
          { action, executed: false, error: err instanceof Error ? err.message : String(err) },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ action, executed: false, blocker: policy.blocker, message: policy.message }, { status: 202 });
  } finally {
    closeDb();
  }
}
