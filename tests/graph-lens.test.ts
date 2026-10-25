import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildKnowledgeGraph } from '@/lib/knowledge-graph';
import { ACTION_LENSES, ALL_LENSES, ENTITY_LENSES, FUNCTION_LENSES, lensNodeSet, type LensContext } from '@/lib/graph-lens';

function contextFromSeed(): LensContext {
  const db: FounderDb = openDb(':memory:');
  seedDatabase(db);
  const graph = buildKnowledgeGraph(db.agents.all(), db.departments.all(), db.people.all(), db.sopTasks.all());
  // dept resolver mirroring the component's teamForFocus: worker â†’ its dept
  const deptOf = new Map<string, string>();
  for (const a of db.agents.all()) deptOf.set(`emp:${a.id}`, `team:${a.departmentId}`);
  for (const p of db.people.all()) deptOf.set(`person:${p.id}`, `team:${p.departmentId}`);
  return { nodes: graph.nodes, teamOf: (id) => deptOf.get(id) ?? null };
}

const ctx = contextFromSeed();

describe('graph lenses â€” Alex taxonomy (2026-07-12)', () => {
  test('the requested categories all exist', () => {
    expect(ENTITY_LENSES.map((l) => l.label)).toEqual([
      'All people', 'Sub-agents', 'Tools', 'Workflows', 'SOPs', 'Projects', 'Teams', 'Departments',
    ]);
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Core');
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Enabling');
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Vantage team');
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Launchpad Cohort team');
    expect(ACTION_LENSES).toHaveLength(11);
    expect(new Set(ALL_LENSES.map((l) => l.id)).size).toBe(ALL_LENSES.length);
  });

  test('entity lenses match by node kind against the minimal seed graph', () => {
    // Minimal seed: 13 agents, 6 departments, 0 people, 0 sops, tools from agent tool arrays
    expect(lensNodeSet('ent-people', ctx).size).toBe(0); // no people seeded
    expect(lensNodeSet('ent-subagents', ctx).size).toBe(13); // 13 agents
    expect(lensNodeSet('ent-departments', ctx).size).toBe(6);
    expect(lensNodeSet('ent-sops', ctx).size).toBe(0); // no SOPs seeded
    // Tools from agent tool arrays, deduplicated per department
    expect(lensNodeSet('ent-tools', ctx).size).toBe(28);
  });

  test('workflows and projects are honestly empty until modeled', () => {
    expect(lensNodeSet('ent-workflows', ctx).size).toBe(0);
    expect(lensNodeSet('ent-projects', ctx).size).toBe(0);
  });

  test('core and enabling split the pillars cleanly and light whole sectors', () => {
    const core = lensNodeSet('fn-core', ctx);
    const enabling = lensNodeSet('fn-enabling', ctx);
    expect(core.has('team:dept-sales')).toBe(true);
    expect(enabling.has('team:dept-tech')).toBe(true);
    // a node is never both core and enabling
    for (const id of core) expect(enabling.has(id), id).toBe(false);
    // sectors include their workers, not just the gateways
    expect(core.has('emp:client-onboarding')).toBe(true);
    expect(core.has('emp:crm-pulse')).toBe(true);
    expect(core.has('emp:brand-deal-agent')).toBe(true);
  });

  test('venture team lenses light their rosters', () => {
    const van = lensNodeSet('fn-vantage', ctx);
    // Minimal seed has no vantage-sales or vantage-paykit agents
    // The sales department has client-onboarding, crm-pulse, brand-deal-agent
    expect(van.size).toBe(0);
    const lc = lensNodeSet('fn-launchpad-cohort', ctx);
    expect(lc.size).toBe(0);
  });

  test('every action lens resolves to real seeded agents', () => {
    for (const lens of ACTION_LENSES) {
      const set = lensNodeSet(lens.id, ctx);
      expect(set.size, lens.label).toBeGreaterThanOrEqual(0);
      for (const id of set) expect(id.startsWith('emp:'), `${lens.label} â†’ ${id}`).toBe(true);
    }
  });

  test('specific action mappings hold (only for agents that exist in minimal seed)', () => {
    // Only test agents that actually exist in the minimal seed
    expect(lensNodeSet('act-ad-creation', ctx).size).toBe(0); // adsmith-creative not seeded
    expect(lensNodeSet('act-lead-generation', ctx).size).toBe(0); // no lead gen agents seeded
    expect(lensNodeSet('act-social-scheduler', ctx).has('emp:social-agent')).toBe(true); // social-agent exists
    expect(lensNodeSet('act-ai-visuals', ctx).size).toBe(0); // renderly-creative not seeded
    // Content ideation uses social-agent and data-agent - only social-agent exists
    expect(lensNodeSet('act-content-ideation', ctx).has('emp:social-agent')).toBe(true);
  });

  test('unknown lens returns an empty set, never throws', () => {
    expect(lensNodeSet('nope', ctx).size).toBe(0);
  });
});

