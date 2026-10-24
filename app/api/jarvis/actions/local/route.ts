/**
 * Jarvis governed local actions API.
 *
 * POST /api/jarvis/actions/local   { kind, args }
 *   kind: open_project | open_editor | read_file | write_note | list_folder | git_status | disk_space | run_build
 *   args: kind-specific arguments
 *
 * Every action is validated against an allowlist, paths are confined to
 * allowed drives, and every request/outcome is audited. Actions that mutate
 * state always need approval — the caller should first GET /api/jarvis/actions
 * to see pending items, then POST /api/jarvis/actions/[id]/decide.
 */

import { NextResponse } from 'next/server';
import { buildRequest, executeLocalAction, type LocalActionKind } from '@/lib/jarvis/actions';
import { log as auditLog } from '@/lib/jarvis/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await req.json()) as { kind?: LocalActionKind; args?: Record<string, unknown>; approve?: boolean };
  const { kind, args } = body;

  if (!kind) {
    return NextResponse.json({ error: 'kind is required' }, { status: 400 });
  }

  const request = buildRequest(kind, args ?? {});

  // Audit the request.
  auditLog({
    action: 'local_action_request',
    requestId: request.id,
    kind: request.kind,
    title: request.title,
    risk: request.risk,
    needsApproval: request.needsApproval,
    args: request.args,
  });

  // If it needs approval and the caller didn't pre-approve, return pending.
  if (request.needsApproval && body.approve !== true) {
    return NextResponse.json({
      action: request,
      status: 'pending',
      message: 'This action needs your approval. Call POST /api/jarvis/actions/[id]/decide with decision=approve.',
    }, { status: 202 });
  }

  // Execute.
  const result = await executeLocalAction(kind, args ?? {});

  // Audit the outcome.
  auditLog({
    action: 'local_action_outcome',
    requestId: request.id,
    kind: request.kind,
    ok: result.ok,
    summary: result.text.slice(0, 500),
  });

  return NextResponse.json({ action: request, outcome: result });
}
