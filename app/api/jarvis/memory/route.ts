/**
 * Jarvis memory API.
 *
 * GET    /api/jarvis/memory   Read the tail of memory.md.
 * POST   /api/jarvis/memory   Append a new entry: { question, answer, tag? }
 */

import { NextResponse } from 'next/server';
import { addMemory, readMemory } from '@/lib/jarvis/memory';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const memory = readMemory(4000);
  return NextResponse.json({ memory });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { question?: string; answer?: string; tag?: string };
  if (!body.question || !body.answer) {
    return NextResponse.json({ error: 'question and answer are required' }, { status: 400 });
  }
  addMemory(body.question, body.answer, body.tag);
  return NextResponse.json({ ok: true });
}
