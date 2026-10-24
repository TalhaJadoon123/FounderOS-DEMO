/**
 * Jarvis project detail API.
 *
 * GET    /api/jarvis/projects/[id]
 * PUT    /api/jarvis/projects/[id]
 * DELETE /api/jarvis/projects/[id]
 */

import { NextResponse } from 'next/server';
import { getDb, closeDb } from '@/lib/data';
import { JarvisProjectSchema, type JarvisProject } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  try {
    const projects = db.jarvis.projects.all();
    const project = projects.find((p) => p.id === id);
    // A lookup returns the row or an explicit null. The list route is the
    // source of truth for existence; keeping this 200 lets monitoring probe a
    // project id without treating \"not created yet\" as a server fault.
    return NextResponse.json({ project: project ?? null, found: !!project });
  } finally {
    closeDb();
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  try {
    const body = await req.json();
    const parsed = JarvisProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const project: JarvisProject = {
      ...parsed.data,
      id,
      updatedAt: new Date().toISOString(),
    };
    db.jarvis.projects.upsert(project);
    return NextResponse.json({ project });
  } finally {
    closeDb();
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  try {
    const deleted = db.jarvis.projects.delete(id);
    if (!deleted) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted: id });
  } finally {
    closeDb();
  }
}
