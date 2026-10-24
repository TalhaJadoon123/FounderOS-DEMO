/**
 * Probe one system by connector id.
 *
 * POST /api/jarvis/systems/[id]   → live status for that connector only
 *
 * Used by the per-row "Test" button; it never writes a fake status.
 */

import { NextResponse } from 'next/server';
import { probeSystem } from '@/lib/jarvis/systems';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const status = await probeSystem(id);
    if (!status) {
      return NextResponse.json({ error: `unknown system: ${id}` }, { status: 404 });
    }
    return NextResponse.json({ system: status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
