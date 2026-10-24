/**
 * Trigger a Jarvis run.
 *
 * POST /api/jarvis/run   { trigger: 'manual' | 'schedule' | 'webhook', projectId?: string }
 *
 * Runs one project (or all) through watch → verify → ship → announce → sell → report.
 */

import { NextResponse } from 'next/server';
import { runAll, runProject } from '@/lib/jarvis/orchestrator';
import { getDb, closeDb } from '@/lib/data';
import type { JarvisProject } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await req.json()) as { trigger?: 'manual' | 'schedule' | 'webhook'; projectId?: string };
  const trigger = body.trigger ?? 'manual';
  const projectId = body.projectId;

  if (projectId) {
    const db = getDb();
    try {
      const projects = db.jarvis.projects.all();
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        return NextResponse.json({ error: 'project not found' }, { status: 404 });
      }
      const result = await runProject({ project, trigger, db });
      return NextResponse.json(result);
    } finally {
      closeDb();
    }
  }

  const result = await runAll({ trigger });
  return NextResponse.json(result);
}
