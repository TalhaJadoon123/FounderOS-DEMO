/**
 * Jarvis autopilot kill switch + mode.
 *
 * GET    /api/jarvis/autopilot   — { enabled, autonomy, killSwitch, killSwitchEnv }
 * POST   /api/jarvis/autopilot   — { autonomy: 'observe'|'assisted'|'autopilot' | killSwitch: 'on'|'off' }
 *
 * The autonomy mode and the UI kill switch live in jarvis_settings so they
 * take effect immediately. JARVIS_KILL_SWITCH=1 in the environment always
 * wins and cannot be cleared from the UI.
 */

import { NextResponse } from 'next/server';
import { getDb, closeDb } from '@/lib/data';
import { KILL_SWITCH, killSwitchActive } from '@/lib/jarvis/policy';
import type { JarvisAutonomy } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MODES: JarvisAutonomy[] = ['observe', 'assisted', 'autopilot'];

export async function GET() {
  const db = getDb();
  try {
    const autonomy = (db.jarvis.settings.get('autopilot') ?? 'assisted') as JarvisAutonomy;
    const intent = db.jarvis.settings.get('killSwitchIntent');
    return NextResponse.json({
      enabled: autonomy === 'autopilot' && !killSwitchActive(intent),
      autonomy,
      killSwitch: killSwitchActive(intent),
      killSwitchEnv: KILL_SWITCH,
      killSwitchIntent: intent ?? 'off',
    });
  } finally {
    closeDb();
  }
}

export async function POST(req: Request) {
  const db = getDb();
  try {
    const body = (await req.json()) as { autonomy?: JarvisAutonomy; killSwitch?: 'on' | 'off' };

    if (body.autonomy) {
      if (!MODES.includes(body.autonomy)) {
        return NextResponse.json({ error: `autonomy must be one of ${MODES.join(', ')}` }, { status: 400 });
      }
      db.jarvis.settings.set('autopilot', body.autonomy);
    }
    if (body.killSwitch === 'on' || body.killSwitch === 'off') {
      db.jarvis.settings.set('killSwitchIntent', body.killSwitch);
    }

    const autonomy = (db.jarvis.settings.get('autopilot') ?? 'assisted') as JarvisAutonomy;
    const intent = db.jarvis.settings.get('killSwitchIntent');
    return NextResponse.json({
      enabled: autonomy === 'autopilot' && !killSwitchActive(intent),
      autonomy,
      killSwitch: killSwitchActive(intent),
      killSwitchEnv: KILL_SWITCH,
      killSwitchIntent: intent ?? 'off',
      note:
        body.killSwitch && KILL_SWITCH
          ? 'JARVIS_KILL_SWITCH=1 is set in the environment; the UI switch cannot clear it.'
          : undefined,
    });
  } finally {
    closeDb();
  }
}
