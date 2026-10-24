/**
 * Jarvis projects API.
 *
 * GET    /api/jarvis/projects   — list all projects
 * POST   /api/jarvis/projects   — create a project
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, closeDb } from '@/lib/data';
import { JarvisProjectSchema, type JarvisProject } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  try {
    const projects = db.jarvis.projects.all();
    return NextResponse.json({ projects });
  } finally {
    closeDb();
  }
}

export async function POST(req: Request) {
  const db = getDb();
  try {
    const body = await req.json();
    const parsed = JarvisProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const project: JarvisProject = {
      ...parsed.data,
      id: body.id || `jarvis-project-${randomUUID()}`,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.jarvis.projects.upsert(project);
    return NextResponse.json({ project }, { status: 201 });
  } finally {
    closeDb();
  }
}
