import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildKnowledgeGraph, toolSlugOf } from '@/lib/knowledge-graph';
import { playbookFor } from '@/lib/sop-playbooks';
import { buildToolWiki } from '@/lib/agent-wiki';
import { buildWikiIndex } from '@/lib/brain-wiki';
import { buildBrainDocs } from '@/lib/brain-docs';
import { INTEGRATIONS } from '@/lib/integrations-catalog';

/**
 * Plaud sits everywhere Fathom sits: it is the recorder for the room the way
 * Fathom is the recorder for calls. Tools table, the sales pillar and the
 * agents that mine recordings, the SOP that does the mining, the G-Brain
 * knowledge graph (a tool node with `uses` edges), the wiki, the catalog.
 * 
 * NO seeded Plaud data â€” create from the OS.
 */
let db: FounderDb;
afterEach(() => db?.close());

function seeded(): FounderDb {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
}

describe('Plaud placement across the OS â€” no seeded data', () => {
  test('tools table is empty (no seeded tools)', () => {
    const tools = seeded().tools.all();
    expect(tools).toHaveLength(0);
  });

  test('no seeded agents use plaud', () => {
    const agents = seeded().agents.all();
    expect(agents.some((a) => a.tools.includes('plaud'))).toBe(false);
  });

  test('no seeded SOP tasks use plaud', () => {
    const tasks = seeded().sopTasks.all();
    expect(tasks).toHaveLength(0);
  });

  test('G-Brain knowledge graph has no Plaud tool nodes', () => {
    const d = seeded();
    const graph = buildKnowledgeGraph(d.agents.all(), d.departments.all(), d.people.all(), d.sopTasks.all());
    const plaudNodes = graph.nodes.filter((n) => n.kind === 'tool' && toolSlugOf(n.id) === 'plaud');
    expect(plaudNodes.length).toBe(0);
  });

  test('wiki knows the tool from catalog (not seeded data)', () => {
    // The catalog still has the Plaud integration definition
    expect(INTEGRATIONS.find((i) => i.slug === 'plaud')?.connectorId).toBe('plaud');
  });
});

