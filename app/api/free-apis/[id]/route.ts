import { NextResponse } from 'next/server';
import { freeApiStatus } from '@/lib/connectors/free-apis';

/**
 * Probe one keyless public source. Powers the per-row "test" affordance on the
 * integrations board; unknown ids are a 404 rather than a fake row.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const status = await freeApiStatus(params.id);
  if (!status) return NextResponse.json({ error: 'unknown source' }, { status: 404 });
  return NextResponse.json(status);
}