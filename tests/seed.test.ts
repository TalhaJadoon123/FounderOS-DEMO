import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('seedDatabase — minimal runtime seed (no demo data)', () => {
  test('populates only structural runtime tables', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // Only 6 departments, 13 agents, 5 crons are seeded
    expect(db.departments.all().length).toBe(6);
    expect(db.agents.all().length).toBe(13);
    expect(db.agentCrons.all().length).toBe(5);
    // All other tables are EMPTY — no demo content
    expect(db.tools.all()).toHaveLength(0);
    expect(db.roadmap.all()).toHaveLength(0);
    expect(db.metrics.all()).toHaveLength(0);
    expect(db.domains.all()).toHaveLength(0);
    expect(db.phases.all()).toHaveLength(0);
    expect(db.workflows.all()).toHaveLength(0);
    expect(db.skills.all()).toHaveLength(0);
    expect(db.agentTasks.all()).toHaveLength(0);
    expect(db.emailList.snapshots()).toHaveLength(0);
    expect(db.social.snapshots('instagram')).toHaveLength(0);
    expect(db.social.accounts()).toHaveLength(0);
    expect(db.funnel.journeys()).toHaveLength(0);
    expect(db.jarvis.projects.all()).toHaveLength(0);
    expect(db.jarvis.revenue.all()).toHaveLength(0);
    expect(db.trading.latestSnapshots()).toHaveLength(0);
  });

  test('every agent belongs to an existing department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const deptIds = new Set(db.departments.all().map((d) => d.id));
    for (const agent of db.agents.all()) {
      expect(deptIds.has(agent.departmentId)).toBe(true);
    }
  });

  test('every seeded agent has a valid schema and department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const deptIds = new Set(db.departments.all().map((d) => d.id));
    for (const agent of db.agents.all()) {
      expect(deptIds.has(agent.departmentId)).toBe(true);
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.status).toBeTruthy();
      expect(['lead', 'worker'].includes(agent.tier)).toBe(true);
    }
    // Minimal seed: 13 agents (6 pillars + conductors/workers)
    expect(db.agents.all().length).toBe(13);
  });

  test('the six operating pillars, in order', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.departments.all().map((d) => d.name)).toEqual([
      'Sales',
      'Marketing/Growth',
      'TECH',
      'Finances',
      'Communications',
      'Clients',
    ]);
  });

  test('agents are homed in the right department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byId = new Map(db.agents.all().map((a) => [a.id, a.departmentId]));
    // The 13 agents in the new minimal seed
    expect(byId.get('conductor')).toBe('dept-tech');
    expect(byId.get('comms-digest')).toBe('dept-comms');
    expect(byId.get('comms-agent')).toBe('dept-comms');
    expect(byId.get('email-agent')).toBe('dept-comms');
    expect(byId.get('whatsapp-agent')).toBe('dept-comms');
    expect(byId.get('slack-agent')).toBe('dept-comms');
    expect(byId.get('client-onboarding')).toBe('dept-sales');
    expect(byId.get('crm-pulse')).toBe('dept-sales');
    expect(byId.get('brand-deal-agent')).toBe('dept-sales');
    expect(byId.get('social-agent')).toBe('dept-marketing-growth');
    expect(byId.get('content-agent')).toBe('dept-marketing-growth');
    expect(byId.get('finance-agent')).toBe('dept-finance');
    expect(byId.get('ops-agent')).toBe('dept-clients');
  });

  test('re-seeding removes departments that left the model', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.departments.insert({ id: 'dept-ghost', name: 'Ghost', slug: 'ghost', tagline: '', color: '#fff', order: 99 });
    seedDatabase(db);
    expect(db.departments.all().some((d) => d.id === 'dept-ghost')).toBe(false);
  });

  test('instance agents have task workers parented beneath them', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byId = new Map(db.agents.all().map((a) => [a.id, a]));
    // Comms: the channel workers that feed /comms hang off the comms agent
    for (const worker of ['email-agent', 'whatsapp-agent', 'slack-agent']) {
      expect(byId.get(worker)?.parentId).toBe('comms-agent');
      expect(byId.get(worker)?.tier).toBe('worker');
    }
    // Top-level agents are instance slots awaiting Clawline/Claude Code bindings
    expect(byId.get('conductor')?.parentId).toBeNull();
    expect(byId.get('conductor')?.instance).not.toBe('');
    expect(byId.get('comms-agent')?.parentId).toBeNull();
    expect(byId.get('comms-agent')?.instance).not.toBe('');
  });

  test('re-seeding removes agents that left the roster', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.agents.insert({
      id: 'ghost', departmentId: 'dept-tech', name: 'Ghost', role: 'r', status: 'active',
      tier: 'lead', description: '', model: 'm', tools: [], parentId: null, instance: 'builtin',
    });
    seedDatabase(db);
    expect(db.agents.all().some((a) => a.id === 'ghost')).toBe(false);
  });

  test('is idempotent — seeding twice does not duplicate rows', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const counts = {
      departments: db.departments.all().length,
      agents: db.agents.all().length,
      crons: db.agentCrons.all().length,
    };
    seedDatabase(db);
    expect(db.departments.all().length).toBe(counts.departments);
    expect(db.agents.all().length).toBe(counts.agents);
    expect(db.agentCrons.all().length).toBe(counts.crons);
  });

  test('no email list demo data — table starts empty', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.emailList.snapshots()).toHaveLength(0);
    expect(db.emailList.latest()).toBeNull();
  });

  test('re-seeding does not create fake email history', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // Even if old data existed, re-seed with empty seed leaves it alone
    // (only prunes seed-origin rows, but there are none in the new seed)
    db.emailList.insertSnapshot({ capturedAt: '2026-03-14', subscribers: 25800, source: 'seed-dummy' });
    seedDatabase(db);
    // Old non-seed-origin rows survive (they're operator data)
    expect(db.emailList.snapshots().some((s) => s.source === 'seed-dummy')).toBe(true);
  });

  test('seeded data passes schema validation end to end', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // openDb repos parse rows through Zod on the way out
    expect(() => {
      db.departments.all();
      db.agents.all();
      db.agentCrons.all();
    }).not.toThrow();
  });
});

describe('roadmap grouping — empty when no seed data', () => {
  test('groups roadmap items by quarter in chronological order (empty)', async () => {
    const { groupRoadmapByQuarter } = await import('@/lib/roadmap');
    db = openDb(':memory:');
    seedDatabase(db);
    const grouped = groupRoadmapByQuarter(db.roadmap.all());
    expect(grouped).toHaveLength(0);
  });
});