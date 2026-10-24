/**
 * Jarvis scheduled webhook endpoint — called by a cron (Vercel Cron, GitHub
 * Actions, the in-process tick, or the Docker scheduler) to run Jarvis on a
 * schedule.
 *
 * POST /api/jarvis/schedule   { secret: <JARVIS_SCHEDULE_SECRET> }
 *
 * Scheduled runs only happen in autopilot. Assisted/observe are manual modes:
 * they still watch and propose when triggered by the operator, but a timer
 * must not generate a queue of proposals the operator never asked for.
 */

import { NextResponse } from 'next/server';
import { runAll } from '@/lib/jarvis/orchestrator';
import { killSwitchActive } from '@/lib/jarvis/policy';
import { getDb, closeDb } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.JARVIS_SCHEDULE_SECRET;
  if (secret) {
    const body = (await req.json().catch(() => ({}))) as { secret?: string };
    if (body.secret !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const db = getDb();
  let autonomy = 'assisted';
  let killed = false;
  try {
    autonomy = db.jarvis.settings.get('autopilot') ?? 'assisted';
    killed = killSwitchActive(db.jarvis.settings.get('killSwitchIntent'));
  } finally {
    closeDb();
  }

  if (killed) {
    return NextResponse.json({ results: [], skipped: true, reason: 'kill switch is on' });
  }
  if (autonomy !== 'autopilot') {
    return NextResponse.json({
      results: [],
      skipped: true,
      reason: `autonomy is "${autonomy}" — scheduled runs only execute in autopilot`,
    });
  }

  const result = await runAll({ trigger: 'schedule' });
  return NextResponse.json(result);
}
