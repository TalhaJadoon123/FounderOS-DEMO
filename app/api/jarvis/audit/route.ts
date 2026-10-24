/**
 * Jarvis audit log API.
 *
 * GET /api/jarvis/audit   Read the last N records from the audit JSONL log.
 * Query: ?n=100
 */

import { NextResponse } from 'next/server';
import { readTail } from '@/lib/jarvis/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const n = searchParams.get('n');
  const count = n ? Number(n) : 100;
  const records = readTail(isNaN(count) ? 100 : count);
  return NextResponse.json({ records, count: records.length });
}
