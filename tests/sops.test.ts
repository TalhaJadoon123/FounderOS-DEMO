import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

function seeded(): FounderDb {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
}

function withSalesDept(): FounderDb {
  db = openDb(':memory:');
  db.departments.insert({
    id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'Pipeline and deals.', color: '#fafafa', order: 1,
  });
  return db;
}

describe('people + sopTasks repos', () => {
  test('empty db has queryable people and sop_tasks tables', () => {
    db = openDb(':memory:');
    expect(db.people.all()).toEqual([]);
    expect(db.sopTasks.all()).toEqual([]);
  });

  test('round-trips a person including their tools array', () => {
    const d = withSalesDept();
    const person = {
      id: 'person-lee',
      departmentId: 'dept-sales',
      name: 'Lee',
      role: 'Head of Sales',
      tools: ['fathom', 'attio'],
    };
    d.people.insert(person);
    expect(d.people.all()).toEqual([person]);
  });

  test('round-trips a task including its written-out steps', () => {
    const d = withSalesDept();
    const task = {
      id: 'sop-close-calls',
      departmentId: 'dept-sales',
      title: 'Run discovery & close calls',
      summary: 'Live sales calls from booked to closed-won.',
      steps: ['Review the lead in Attio', 'Run the discovery script', 'Log outcome + next step'],
      assigneeKind: 'person' as const,
      assigneeId: 'person-lee',
    };
    d.sopTasks.insert(task);
    expect(d.sopTasks.all()).toEqual([task]);
  });

  test('rejects a task whose SOP has fewer than 3 written-out steps', () => {
    const d = withSalesDept();
    expect(() =>
      d.sopTasks.insert({
        id: 'sop-thin',
        departmentId: 'dept-sales',
        title: 'Underspecified job',
        summary: '',
        steps: ['only one step'],
        assigneeKind: 'agent',
        assigneeId: 'sales-agent',
      }),
    ).toThrow();
  });
});

describe('seeded SOP graph data — now EMPTY (no demo data)', () => {
  test('seeding produces zero people and zero tasks', () => {
    const d = seeded();
    expect(d.people.all()).toHaveLength(0);
    expect(d.sopTasks.all()).toHaveLength(0);
    expect(d.agents.all().length).toBeGreaterThan(0); // agents still seeded
  });

  test('seeding is idempotent (empty stays empty)', () => {
    const d = seeded();
    seedDatabase(d);
    expect(d.people.all()).toHaveLength(0);
    expect(d.sopTasks.all()).toHaveLength(0);
  });

  test('no tasks means no assignee checks needed', () => {
    const d = seeded();
    expect(d.sopTasks.all()).toHaveLength(0);
  });
});
