/**
 * Jarvis orchestrator — the autopilot loop.
 *
 * Six stages, in order, for each project:
 *
 *   1. watch    — probe the real health/deploy URL over HTTP
 *   2. verify   — run the project's real verify command (or read GitHub CI)
 *   3. ship     — trigger the real deploy hook when the gate is green
 *   4. announce — post to the real Slack/Resend/webhook channels
 *   5. sell     — reuse a checkout URL or queue a real Stripe checkout
 *   6. report   — sync paid Stripe sessions, then roll up revenue/health
 *
 * Autonomy decides what runs unattended vs. needs a human yes. Every stage
 * and every action is persisted (jarvis_runs, jarvis_steps, jarvis_actions)
 * so the operator always sees what Jarvis did, what it cost, and what is
 * waiting on them.
 *
 * There is no simulated success path. If a URL is unreachable, a command is
 * missing, or a key is absent, the step says so.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/data';
import {
  type JarvisProject,
  type JarvisStage,
  type JarvisRunStatus,
  type JarvisAction,
  type JarvisActionKind,
} from '@/lib/schemas';
import { verdictFor, killSwitchActive } from './policy';
import { executeAction } from './executor';
import { executeLocalAction } from './actions';
import { syncStripeRevenue } from './revenue';

/** A step record the orchestrator writes for each stage. */
type Step = {
  id: string;
  stage: JarvisStage;
  seq: number;
  status: 'ok' | 'skipped' | 'needs_approval' | 'error';
  detail: string;
  startedAt: string;
  finishedAt: string;
};

type ProbeResult = {
  ok: boolean;
  status: number | null;
  ms: number;
  detail: string;
};

type VerifyResult = {
  status: 'ok' | 'skipped' | 'error';
  green: boolean;
  detail: string;
};

/** Probe a URL for real. No cache, hard timeout, status + latency recorded. */
async function probeUrl(url: string, timeoutMs = 10_000): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'FounderOS-Jarvis/1.0' },
    });
    // Drain a small amount so the connection can close cleanly.
    await res.text().catch(() => '');
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      detail: `HTTP ${res.status} in ${Date.now() - started}ms`,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      ms: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Read the latest GitHub Actions conclusion for the project's branch. */
async function verifyFromGitHub(project: JarvisProject): Promise<VerifyResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!project.repo || !token) {
    return {
      status: 'skipped',
      green: false,
      detail: project.repo
        ? 'GITHUB_TOKEN not set — cannot read CI status.'
        : 'No GitHub repo configured.',
    };
  }
  try {
    const url = `https://api.github.com/repos/${project.repo}/actions/runs?branch=${encodeURIComponent(
      project.branch,
    )}&per_page=1`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'user-agent': 'FounderOS-Jarvis/1.0',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { status: 'skipped', green: false, detail: `GitHub CI lookup returned HTTP ${res.status}.` };
    }
    const body = (await res.json()) as {
      workflow_runs?: Array<{
        status?: string;
        conclusion?: string | null;
        html_url?: string;
        head_branch?: string;
      }>;
    };
    const run = body.workflow_runs?.[0];
    if (!run) {
      return { status: 'skipped', green: false, detail: `No workflow runs on ${project.branch}.` };
    }
    if (run.status !== 'completed') {
      return { status: 'skipped', green: false, detail: `CI is ${run.status ?? 'running'} on ${project.branch}.` };
    }
    const green = run.conclusion === 'success';
    return {
      status: green ? 'ok' : 'error',
      green,
      detail: `CI ${run.conclusion ?? 'unknown'}${run.html_url ? ` — ${run.html_url}` : ''}`,
    };
  } catch (err) {
    return {
      status: 'skipped',
      green: false,
      detail: `CI lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Run the real verification gate:
 *   1. a configured local verify command (build/tests) — executed for real
 *   2. the latest GitHub Actions conclusion when a repo + token exist
 *   3. otherwise honest "no verifier configured"
 */
async function verifyProject(project: JarvisProject): Promise<VerifyResult> {
  if (project.verifyCommand && project.localPath) {
    const result = await executeLocalAction('run_build', {
      path: project.localPath,
      command: project.verifyCommand,
    });
    return {
      status: result.ok ? 'ok' : 'error',
      green: result.ok,
      detail: result.text.slice(0, 1200),
    };
  }
  if (project.verifyCommand && !project.localPath) {
    return {
      status: 'skipped',
      green: false,
      detail: 'verifyCommand is set but localPath is empty — nothing was executed.',
    };
  }
  return verifyFromGitHub(project);
}

/** Do we have at least one real announcement channel configured? */
function announceChannels(): string[] {
  const channels: string[] = [];
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_ANNOUNCE_CHANNEL) channels.push('slack');
  if (process.env.RESEND_API_KEY && process.env.JARVIS_ANNOUNCE_TO) channels.push('email');
  if (process.env.JARVIS_ANNOUNCE_WEBHOOK_URL) channels.push('webhook');
  return channels;
}

/** Insert a pending action once; re-use an existing pending action of the same kind. */
function proposeAction({
  db,
  project,
  runId,
  kind,
  title,
  risk,
  payload,
}: {
  db: ReturnType<typeof getDb>;
  project: JarvisProject;
  runId: string;
  kind: JarvisActionKind;
  title: string;
  risk: 'low' | 'medium' | 'high';
  payload: Record<string, unknown>;
}): JarvisAction {
  const existing = db.jarvis.actions
    .pending()
    .find((a) => a.projectId === project.id && a.kind === kind);
  if (existing) return existing;

  const action: JarvisAction = {
    id: `jarvis-action-${randomUUID()}`,
    projectId: project.id,
    runId,
    kind,
    title,
    risk,
    status: 'pending',
    payload,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  db.jarvis.actions.insert(action);
  return action;
}

/** One pass over one project. Returns the run record the API can return. */
export async function runProject({
  project,
  trigger,
  db,
}: {
  project: JarvisProject;
  trigger: 'manual' | 'schedule' | 'webhook';
  db: ReturnType<typeof getDb>;
}): Promise<{ runId: string; status: JarvisRunStatus; summary: string }> {
  const runId = `jarvis-run-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const steps: Step[] = [];
  let overall: JarvisRunStatus = 'ok';
  let summary = '';

  const now = () => new Date().toISOString();
  const addStep = (stage: JarvisStage, seq: number, status: Step['status'], detail: string) => {
    const step: Step = {
      id: `jarvis-step-${randomUUID()}`,
      stage,
      seq,
      status,
      detail,
      startedAt: now(),
      finishedAt: now(),
    };
    steps.push(step);
    db.jarvis.steps.insert({
      id: step.id,
      runId,
      projectId: project.id,
      stage,
      seq,
      status,
      detail,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
    });
  };
  const note = (text: string) => {
    summary = summary ? `${summary}; ${text}` : text;
  };

  const killIntent = db.jarvis.settings.get('killSwitchIntent');
  if (killSwitchActive(killIntent)) {
    const finishedAt = now();
    summary = 'Jarvis is paused by the kill switch. Nothing ran.';
    db.jarvis.runs.insert({
      id: runId,
      projectId: project.id,
      trigger,
      status: 'paused',
      startedAt,
      finishedAt,
      summary,
    });
    return { runId, status: 'paused', summary };
  }

  try {
    // ── 1. WATCH ────────────────────────────────────────────────────────────
    const healthUrl = project.healthUrl || (project.deployUrl ? `${project.deployUrl.replace(/\/$/, '')}/api/health` : '');
    const deployUrl = project.deployUrl;
    let reachable = false;
    let probeDetail = 'No health or deploy URL configured.';

    if (healthUrl) {
      const probe = await probeUrl(healthUrl);
      reachable = probe.ok;
      probeDetail = `${healthUrl} — ${probe.detail}`;
    } else if (deployUrl) {
      const probe = await probeUrl(deployUrl);
      reachable = probe.ok;
      probeDetail = `${deployUrl} — ${probe.detail}`;
    }

    addStep('watch', 1, reachable ? 'ok' : 'skipped', probeDetail);
    if (!reachable && project.status === 'live') {
      overall = 'needs_you';
      note(`Deployment not reachable — Jarvis paused ${project.name} until you fix it.`);
    }

    // ── 2. VERIFY ───────────────────────────────────────────────────────────
    const verify = project.autonomy === 'observe'
      ? { status: 'skipped' as const, green: false, detail: 'Observe mode — verification is not executed.' }
      : await verifyProject(project);
    addStep('verify', 2, verify.status, verify.detail);
    if (verify.status === 'error') {
      overall = 'needs_you';
      note(`Verification failed — Jarvis will not ship ${project.name}.`);
    }

    // ── 3. SHIP ─────────────────────────────────────────────────────────────
    const hookUrl = process.env[project.deployHookEnv];
    const shipHealth = reachable ? (verify.green ? 'green' : 'yellow') : 'red';
    const deployPolicy = verdictFor({
      autonomy: project.autonomy,
      kind: 'deploy',
      risk: 'low',
      health: shipHealth,
    });

    if (!hookUrl) {
      addStep('ship', 3, 'skipped', `No deploy hook — set ${project.deployHookEnv}.`);
    } else if (!reachable) {
      addStep('ship', 3, 'skipped', 'Deployment is not reachable — refusing to redeploy.');
    } else if (!verify.green) {
      addStep('ship', 3, 'skipped', 'Verification is not green — refusing to redeploy.');
    } else if (deployPolicy.ok) {
      const result = await executeAction({
        kind: 'deploy',
        payload: { projectId: project.id, hookUrl },
      });
      addStep('ship', 3, result.ok ? 'ok' : 'error', result.summary);
      if (!result.ok) {
        overall = 'failed';
        note(`Deploy failed: ${result.summary}`);
      }
    } else {
      proposeAction({
        db,
        project,
        runId,
        kind: 'deploy',
        title: `Deploy ${project.name}`,
        risk: 'low',
        payload: { projectId: project.id, hookUrl },
      });
      addStep('ship', 3, 'needs_approval', deployPolicy.message);
      overall = 'needs_you';
      note(deployPolicy.message);
    }

    // ── 4. ANNOUNCE ─────────────────────────────────────────────────────────
    const channels = announceChannels();
    const announcePolicy = verdictFor({
      autonomy: project.autonomy,
      kind: 'announce',
      risk: 'low',
      health: shipHealth,
    });

    if (project.status !== 'live' || !reachable) {
      addStep('announce', 4, 'skipped', 'Project is not live/reachable.');
    } else if (channels.length === 0) {
      addStep('announce', 4, 'skipped', 'No announcement channels configured (Slack/Resend/webhook).');
    } else if (announcePolicy.ok) {
      const result = await executeAction({
        kind: 'announce',
        payload: {
          projectId: project.id,
          title: project.name,
          deployUrl: project.deployUrl,
          checkoutUrl: project.checkoutUrl || undefined,
        },
      });
      addStep('announce', 4, result.ok ? 'ok' : 'error', result.summary);
      if (!result.ok) {
        overall = 'needs_you';
        note(result.summary);
      }
    } else {
      proposeAction({
        db,
        project,
        runId,
        kind: 'announce',
        title: `Announce ${project.name}`,
        risk: 'low',
        payload: {
          projectId: project.id,
          title: project.name,
          deployUrl: project.deployUrl,
          checkoutUrl: project.checkoutUrl || undefined,
        },
      });
      addStep('announce', 4, 'needs_approval', announcePolicy.message);
      overall = 'needs_you';
      note(announcePolicy.message);
    }

    // ── 5. SELL ─────────────────────────────────────────────────────────────
    if (project.status !== 'live') {
      addStep('sell', 5, 'skipped', 'Project is not live.');
    } else if (project.checkoutUrl) {
      addStep('sell', 5, 'ok', `Checkout ready: ${project.checkoutUrl}`);
    } else if (!project.stripePriceId) {
      addStep('sell', 5, 'skipped', 'No checkout URL or Stripe price configured.');
    } else if (!process.env.STRIPE_SECRET_KEY) {
      addStep('sell', 5, 'skipped', 'STRIPE_SECRET_KEY not set — cannot mint checkout.');
    } else {
      const base = project.deployUrl || process.env.NEXT_PUBLIC_SITE_URL || `http://localhost:${process.env.PORT ?? '4100'}`;
      proposeAction({
        db,
        project,
        runId,
        kind: 'checkout',
        title: `Create Stripe checkout for ${project.name}`,
        risk: 'medium',
        payload: {
          projectId: project.id,
          priceId: project.stripePriceId,
          successUrl: `${base.replace(/\/$/, '')}/success`,
          cancelUrl: `${base.replace(/\/$/, '')}/cancel`,
        },
      });
      addStep('sell', 5, 'needs_approval', 'Checkout touches money — waiting for your yes.');
      overall = 'needs_you';
      note('Checkout touches money — waiting for your yes.');
    }

    // ── 6. REPORT ───────────────────────────────────────────────────────────
    const sync = await syncStripeRevenue({ projectId: project.id });
    const revenue = db.jarvis.revenue.byProject(project.id);
    const totalCents = revenue.reduce((sum, row) => sum + row.amountCents, 0);
    addStep(
      'report',
      6,
      sync.ok ? 'ok' : 'skipped',
      `${sync.summary} Lifetime for this project: $${(totalCents / 100).toFixed(2)} across ${revenue.length} sale(s).`,
    );
    if (!summary) {
      const okCount = steps.filter((s) => s.status === 'ok').length;
      summary = `Jarvis ran ${project.name}: ${okCount}/${steps.length} stages ok.`;
    }

    const finishedAt = now();
    db.jarvis.runs.insert({
      id: runId,
      projectId: project.id,
      trigger,
      status: overall,
      startedAt,
      finishedAt,
      summary,
    });

    const updated: JarvisProject = {
      ...project,
      health: !healthUrl && !deployUrl ? 'unknown' : reachable ? (verify.green ? 'green' : 'yellow') : 'red',
      updatedAt: finishedAt,
      lastRunAt: finishedAt,
    };
    db.jarvis.projects.upsert(updated);

    return { runId, status: overall, summary };
  } catch (err) {
    const finishedAt = now();
    const message = err instanceof Error ? err.message : String(err);
    db.jarvis.runs.insert({
      id: runId,
      projectId: project.id,
      trigger,
      status: 'failed',
      startedAt,
      finishedAt,
      summary: `Jarvis crashed: ${message}`,
    });
    return { runId, status: 'failed', summary: `Jarvis crashed on ${project.name}: ${message}` };
  }
}

/**
 * Run Jarvis across every project. Called by the API route and the schedule.
 * Returns per-project results. The DB singleton stays open for the caller.
 */
export async function runAll({
  trigger,
}: {
  trigger: 'manual' | 'schedule' | 'webhook';
}): Promise<{
  results: Array<{ projectId: string; name: string; status: JarvisRunStatus; summary: string }>;
  paused?: boolean;
  reason?: string;
}> {
  const db = getDb();
  if (killSwitchActive(db.jarvis.settings.get('killSwitchIntent'))) {
    return { results: [], paused: true, reason: 'Kill switch is on.' };
  }
  const projects = db.jarvis.projects.all();
  const results = [];
  for (const p of projects) {
    const r = await runProject({ project: p, trigger, db });
    results.push({ projectId: p.id, name: p.name, status: r.status, summary: r.summary });
  }
  return { results };
}
