import { NextResponse } from 'next/server';
import { requireIngestAuth } from '@/lib/jarvis/auth';
import { recordLocalFunding } from '@/lib/jarvis/revenue';
import { getDb, closeDb } from '@/lib/data';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Transfer between bot and FounderOS ledger.
 * Compatible with both FounderOS schema and Loopader CLI schema.
 *
 * FounderOS format: { type: 'deposit'|'withdrawal', projectId, amountCents, currency?, reference, note?, feeCents? }
 * Loopader CLI format: { type: 'deposit'|'withdraw', from, to, amount, currency?, reference?, note? }
 *
 * Requires ingest auth when JARVIS_LOCAL_INGEST_TOKEN is set.
 */

export async function POST(req: Request) {
  const auth = requireIngestAuth(req.headers);
  if (auth) return auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  // Normalize both API formats
  let projectId = body.projectId;
  let amountCents = body.amountCents;
  let type = body.type;
  let reference = body.reference;
  let currency = body.currency || 'USD';
  let note = body.note;
  let feeCents = body.feeCents || 0;

  // Handle Loopader CLI format
  if (body.amount !== undefined && amountCents === undefined) {
    amountCents = Math.round(Number(body.amount) * 100);
  }
  if (type === 'withdraw') type = 'withdrawal';
  if (type === 'deposit' && body.to === 'founderos') type = 'deposit';
  if (type === 'withdrawal' && body.from === 'loopader') type = 'withdrawal';

  if (!projectId) {
    if (body.from === 'loopader' || body.to === 'founderos' || body.source === 'loopader') {
      projectId = 'loopader-bot';
    } else if (body.from === 'founderos' || body.to === 'loopader') {
      projectId = 'loopader-bot';
    }
  }

  // Auto-create project if it doesn't exist
  if (projectId) {
    const db = getDb();
    try {
      const projects = db.jarvis.projects.all();
      if (!projects.find((p) => p.id === projectId)) {
        const now = new Date().toISOString();
        db.jarvis.projects.upsert({
          id: projectId,
          name: projectId === 'loopader-bot' ? 'Loopader Bot' : projectId,
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
          status: 'active',
          autonomy: 'assisted',
          health: 'unknown',
          createdAt: now,
          updatedAt: now,
          lastRunAt: null,
        } as any);
      }
    } catch (e) {
      // ignore
    } finally {
      closeDb();
    }
  }

  if (!reference) {
    reference = `loopader-${type}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  if (!projectId || typeof amountCents !== 'number' || !type || !reference) {
    return NextResponse.json(
      { ok: false, error: 'projectId, amountCents/amount, type (deposit/withdrawal), and reference required' },
      { status: 400 },
    );
  }
  if (type !== 'deposit' && type !== 'withdrawal') {
    return NextResponse.json({ ok: false, error: "type must be 'deposit' or 'withdrawal'" }, { status: 400 });
  }
  if (amountCents <= 0) {
    return NextResponse.json({ ok: false, error: 'amount must be positive' }, { status: 400 });
  }

  try {
    const revenue = recordLocalFunding({
      projectId,
      amountCents,
      currency: currency.toUpperCase().slice(0, 3),
      type: type as 'deposit' | 'withdrawal',
      reference,
      note: note || `loopader-${type}`,
      feeCents,
    });
    return NextResponse.json({
      ok: true,
      success: true,
      transfer: {
        type: revenue.source,
        from: body.from || (type === 'withdrawal' ? 'loopader' : 'founderos'),
        to: body.to || (type === 'deposit' ? 'loopader' : 'founderos'),
        amount: amountCents / 100,
        amountCents: revenue.amountCents,
        netCents: revenue.netCents,
        currency: revenue.currency,
        status: revenue.status,
        reference: revenue.externalId,
        occurredAt: revenue.occurredAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
