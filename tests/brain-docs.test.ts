import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildBrainDocs, writeBrainDocs, GENERATED_MARKER } from '@/lib/brain-docs';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

function seeded(): FounderDb {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
}

function docsFor(d: FounderDb) {
  return buildBrainDocs({
    departments: d.departments.all(),
    agents: d.agents.all(),
    people: d.people.all(),
    tasks: d.sopTasks.all(),
    tools: d.tools.all(),
  });
}

describe('buildBrainDocs â€” empty seed (no demo data)', () => {
  test('one doc per agent and pillar (no people, sops, tools)', () => {
    const d = seeded();
    const docs = docsFor(d);
    const paths = new Set(docs.map((x) => x.path));
    // Only 13 agents + 6 departments (pillars) are seeded
    expect(docs.filter((x) => x.path.startsWith('agents/')).length).toBe(d.agents.all().length);
    expect(docs.filter((x) => x.path.startsWith('sops/')).length).toBe(0);
    expect(docs.filter((x) => x.path.startsWith('tools/')).length).toBe(0);
    expect(docs.filter((x) => x.path.startsWith('people/')).length).toBe(0);
    expect(docs.filter((x) => x.path.startsWith('org/pillar-')).length).toBe(d.departments.all().length);
  });

  test('every doc carries the generated marker in frontmatter', () => {
    const docs = docsFor(seeded());
    for (const doc of docs) expect(doc.content).toContain(GENERATED_MARKER);
  });

  test('an agent doc holds its charter, SOP instructions and wikilinked tools', () => {
    const docs = docsFor(seeded());
    const conductor = docs.find((x) => x.path === 'agents/conductor.md')!.content;
    expect(conductor).toContain('Broadcast & Orchestration');
    expect(conductor).toContain('fan-out runtime');
    expect(conductor).toContain('[[clawline]]');
    expect(conductor).toContain('[[tmux]]');
    expect(conductor).toContain('[[pillar-tech]]');
  });

  test('no SOP docs when no sopTasks seeded', () => {
    const docs = docsFor(seeded());
    const sopPaths = docs.filter((x) => x.path.startsWith('sops/'));
    expect(sopPaths).toHaveLength(0);
  });

  test('no tool docs when no tools seeded', () => {
    const docs = docsFor(seeded());
    const toolPaths = docs.filter((x) => x.path.startsWith('tools/'));
    expect(toolPaths).toHaveLength(0);
  });

  test('no people docs when no people seeded', () => {
    const docs = docsFor(seeded());
    const peoplePaths = docs.filter((x) => x.path.startsWith('people/'));
    expect(peoplePaths).toHaveLength(0);
  });

  test('a pillar doc rosters its workers (agents)', () => {
    const docs = docsFor(seeded());
    const tech = docs.find((x) => x.path === 'org/pillar-tech.md')!.content;
    // Tech department only has the conductor in minimal seed
    expect(tech).toContain('[[conductor]]');
    expect(tech).toContain('No SOPs yet.');
  });

  test('deterministic output', () => {
    const d = seeded();
    expect(docsFor(d)).toEqual(docsFor(d));
  });
});

describe('writeBrainDocs â€” empty seed', () => {
  test('writes files, is idempotent, and never clobbers a non-generated file', () => {
    const d = seeded();
    const docs = docsFor(d);
    const dir = mkdtempSync(path.join(tmpdir(), 'brain-docs-'));
    const first = writeBrainDocs(docs, dir);
    expect(first.written).toBeGreaterThan(0);
    expect(existsSync(path.join(dir, 'agents', 'conductor.md'))).toBe(true);

    // hand-edited (non-generated) file must be left alone
    const handmade = path.join(dir, 'agents', 'conductor.md');
    writeFileSync(handmade, '# my own notes, no marker');
    const second = writeBrainDocs(docs, dir);
    expect(readFileSync(handmade, 'utf8')).toBe('# my own notes, no marker');
    expect(second.skipped).toBeGreaterThan(0);

    // only agents and pillars written (no sops, tools, people directories exist)
    expect(existsSync(path.join(dir, 'sops'))).toBe(false);
    expect(existsSync(path.join(dir, 'tools'))).toBe(false);
    expect(existsSync(path.join(dir, 'people'))).toBe(false);
  });
});

