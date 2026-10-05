import { NextResponse } from 'next/server';
import { freeApiStatuses, freeApiSpecs } from '@/lib/connectors/free-apis';
import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * The keyless public sources, probed live.
 *
 * Same honesty rule as every other connector: this returns the real reachable
 * state of each public API, so the board goes green only when the network
 * actually answered. An offline machine gets honest `error` rows.
 */
export async function GET() {
  const statuses = await freeApiStatuses();
  const specs = freeApiSpecs().map(({ probe: _probe, ...rest }) => rest);

  const connected = statuses.filter((s) => s.state === 'connected').length;
  return NextResponse.json({
    sources: statuses,
    catalogue: specs,
    summary: `${connected}/${statuses.length} reachable · no keys required`,
  });
}