import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { PERSONAS } from '@/lib/personas-seed';
import { PersonaSchema } from '@/lib/schemas';

let db: FounderDb;
afterEach(() => db?.close());

describe('PERSONAS seed data (reference only â€” not seeded)', () => {
  test('eleven distinct personas, each valid against the schema', () => {
    expect(PERSONAS).toHaveLength(11);
    const ids = new Set(PERSONAS.map((p) => p.id));
    expect(ids.size).toBe(11);
    const names = new Set(PERSONAS.map((p) => p.name));
    expect(names.size).toBe(11);
    for (const p of PERSONAS) {
      expect(() => PersonaSchema.parse(p)).not.toThrow();
    }
  });

  test('each persona is a full template: 5 pillars (each with agents), connectors, metrics', () => {
    for (const p of PERSONAS) {
      expect(p.pillars.length).toBe(5);
      for (const pillar of p.pillars) expect(pillar.agents.length).toBeGreaterThanOrEqual(1);
      expect(p.connectors.length).toBeGreaterThanOrEqual(5);
      expect(p.metrics.length).toBeGreaterThanOrEqual(4);
      expect(p.northStar.length).toBeGreaterThan(0);
      expect(p.signaturePlay.length).toBeGreaterThan(0);
    }
  });

  test('order is sequential 1..11', () => {
    expect(PERSONAS.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('personas repo â€” no seeded personas (create from OS)', () => {
  let db: FounderDb;
  afterEach(() => db?.close());

  test('seedDatabase loads zero personas (not seeded by default)', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const rows = db.personas.all();
    expect(rows).toHaveLength(0);
  });

  test('insert + re-seed is idempotent (empty stays empty)', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const before = db.personas.all().length;
    seedDatabase(db);
    expect(db.personas.all().length).toBe(before);
  });
});

