import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { JarvisProjectSchema } from '@/lib/schemas';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('jarvis tables', () => {
  test('create a project and round-trip it', () => {
    db = openDb(':memory:');
    const now = new Date().toISOString();
    const project = JarvisProjectSchema.parse({
      id: 'jarvis-test-1',
      name: 'Test Project',
      repo: 'owner/repo',
      branch: 'main',
      deployUrl: 'https://example.com',
      healthUrl: 'https://example.com/api/health',
      checkoutUrl: 'https://buy.stripe.com/test',
      stripePriceId: 'price_123',
      deployHookEnv: 'VERCEL_DEPLOY_HOOK_URL',
      priceCents: 4900,
      currency: 'USD',
      status: 'draft',
      autonomy: 'assisted',
      health: 'unknown',
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
    });
    db.jarvis.projects.upsert(project);
    const all = db.jarvis.projects.all();
    // A real install starts empty; only the project we inserted exists.
    expect(all.length).toBe(1);
    const mine = all.find((p) => p.id === 'jarvis-test-1');
    expect(mine).toBeDefined();
    expect(mine!.name).toBe('Test Project');
    expect(mine!.priceCents).toBe(4900);
    expect(mine!.localPath).toBe('');
    expect(mine!.verifyCommand).toBe('');
  });

  test('starts empty — no demo project is seeded', () => {
    db = openDb(':memory:');
    const all = db.jarvis.projects.all();
    expect(all).toEqual([]);
  });

  test('delete removes the project and its run history', () => {
    db = openDb(':memory:');
    const now = new Date().toISOString();
    const project = JarvisProjectSchema.parse({
      id: 'jarvis-delete-1',
      name: 'Delete Me',
      createdAt: now,
      updatedAt: now,
    });
    db.jarvis.projects.upsert(project);
    db.jarvis.runs.insert({
      id: 'jarvis-run-delete-1',
      projectId: project.id,
      trigger: 'manual',
      status: 'ok',
      startedAt: now,
      finishedAt: now,
      summary: 'ok',
    });
    expect(db.jarvis.projects.delete(project.id)).toBe(true);
    expect(db.jarvis.projects.all()).toEqual([]);
    expect(db.jarvis.runs.byProject(project.id)).toEqual([]);
    expect(db.jarvis.projects.delete(project.id)).toBe(false);
  });

  test('insert and list a run', () => {
    db = openDb(':memory:');
    const now = new Date().toISOString();
    db.jarvis.runs.insert({
      id: 'jarvis-run-1',
      projectId: 'jarvis-test-1',
      trigger: 'manual',
      status: 'ok',
      startedAt: now,
      finishedAt: now,
      summary: 'all green',
    });
    const runs = db.jarvis.runs.byProject('jarvis-test-1');
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe('ok');
  });

  test('insert and decide an action', () => {
    db = openDb(':memory:');
    const now = new Date().toISOString();
    db.jarvis.actions.insert({
      id: 'jarvis-action-1',
      projectId: 'jarvis-test-1',
      runId: null,
      kind: 'deploy',
      title: 'Deploy Test Project',
      risk: 'low',
      status: 'pending',
      payload: {},
      createdAt: now,
      decidedAt: null,
    });
    const pending = db.jarvis.actions.pending();
    expect(pending.length).toBe(1);
    db.jarvis.actions.decide('jarvis-action-1', 'approved');
    const stillPending = db.jarvis.actions.pending();
    expect(stillPending.length).toBe(0);
  });

  test('insert and list revenue', () => {
    db = openDb(':memory:');
    const now = new Date().toISOString();
    db.jarvis.revenue.insert({
      id: 'jarvis-rev-1',
      projectId: 'jarvis-test-1',
      source: 'stripe',
      externalId: 'ch_123',
      customer: 'alex@example.com',
      amountCents: 4900,
      feeCents: 0,
      netCents: 4900,
      currency: 'USD',
      status: 'paid',
      occurredAt: now,
    });
    const rev = db.jarvis.revenue.byProject('jarvis-test-1');
    expect(rev.length).toBe(1);
    expect(rev[0].amountCents).toBe(4900);
    const all = db.jarvis.revenue.all();
    expect(all.length).toBe(1);
  });

  test('settings get/set', () => {
    db = openDb(':memory:');
    expect(db.jarvis.settings.get('missing')).toBeNull();
    db.jarvis.settings.set('autopilot', 'off');
    expect(db.jarvis.settings.get('autopilot')).toBe('off');
  });

  test('default autonomy is assisted', () => {
    db = openDb(':memory:');
    expect(db.jarvis.settings.get('autopilot')).toBe('assisted');
  });
});
