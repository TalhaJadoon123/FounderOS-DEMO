/**
 * Jarvis project discovery API.
 *
 * GET /api/jarvis/discover   Scan local drives for projects (read-only).
 * Query: ?roots=E:/,D:/  &maxDepth=2
 */

import { NextResponse } from 'next/server';
import { discoverProjects, defaultRoots } from '@/lib/jarvis/discovery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rootsParam = searchParams.get('roots');
  const maxDepth = searchParams.get('maxDepth');

  const roots = rootsParam ? rootsParam.split(',').map((s) => s.trim()).filter(Boolean) : defaultRoots();
  const depth = maxDepth ? Number(maxDepth) : 2;

  const projects = discoverProjects({ roots, maxDepth: isNaN(depth) ? 2 : depth });
  return NextResponse.json({ projects, count: projects.length });
}
