import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { contentAgents } from '@/lib/content';

let db: FounderDb;
afterEach(() => db?.close());

describe('contentAgents', () => {
  test('returns the content-creation crew (Marketing/Growth pillar), lead first', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    // Minimal seed: content-agent + social-agent (both lead tier, sorted by name)
    expect(crew[0].id).toBe('content-agent');
    const ids = crew.map((a) => a.id);
    expect(ids).toContain('social-agent');
    expect(ids).toContain('content-agent');
  });

  test('only the content pillar â€” excludes other departments', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    expect(crew.every((a) => a.departmentId === 'dept-marketing-growth')).toBe(true);
    expect(crew.map((a) => a.id)).not.toContain('sales-agent');
    expect(crew.map((a) => a.id)).not.toContain('data-agent');
  });

  test('deterministic + non-empty', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const a = contentAgents(db.agents.all()).map((x) => x.id);
    const b = contentAgents(db.agents.all()).map((x) => x.id);
    expect(a).toEqual(b);
    expect(a.length).toBe(2); // social-agent + content-agent
  });
});

