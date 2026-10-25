import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { DEPARTMENT_HEADS, headForDepartment } from '@/lib/personnel';

/**
 * The rest of the OS is demo-first on purpose, but the roster is the one place
 * where incoherent data actively lies: a name in the org chart that is homed
 * nowhere, or that owns no work, looks like coverage that does not exist.
 *
 * This file pins the seeded roster to the shape the org board draws: every
 * person sits in a real department, carries a role and tools, and owns exactly
 * one SOP â€” and the named department heads are people who are actually on it.
 * 
 * NO seeded people â€” create from the OS.
 */
let db: FounderDb;
afterEach(() => db?.close());

const seeded = (): FounderDb => {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
};

describe('the seeded roster is coherent â€” empty seed', () => {
  test('zero seeded humans', () => {
    const names = seeded().people.all().map((p) => p.name);
    expect(names).toHaveLength(0);
  });

  test('no people to validate', () => {
    const d = seeded();
    expect(d.people.all()).toHaveLength(0);
  });

  test('no sales head or growth head (no seeded people)', () => {
    const people = seeded().people.all();
    expect(people.find((p) => p.name === 'Marco')).toBeUndefined();
    expect(people.find((p) => p.name === 'Nadia')).toBeUndefined();
  });

  test('no department heads (no seeded people)', () => {
    const people = seeded().people.all();
    for (const [departmentId, head] of Object.entries(DEPARTMENT_HEADS)) {
      const person = people.find((p) => p.name === head.name);
      expect(person, `${head.name} is named a head but is not on the roster`).toBeUndefined();
    }
    expect(headForDepartment('dept-nonexistent')).toBeNull();
  });

  test('zero SOP per person (no seeded people or SOPs)', () => {
    const d = seeded();
    const people = d.people.all();
    const personSops = d.sopTasks.all().filter((t) => t.assigneeKind === 'person');
    expect(personSops.length).toBe(0);
    expect(people.length).toBe(0);
  });
});

