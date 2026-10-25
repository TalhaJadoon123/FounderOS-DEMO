import { describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { currentFocus, groupRoadmapByQuarter } from '@/lib/roadmap';
import type { RoadmapItem } from '@/lib/schemas';

const item = (id: string, quarter: string, status: RoadmapItem['status']): RoadmapItem => ({
  id,
  title: id,
  quarter,
  status,
  departmentId: null,
  description: '',
  phaseId: null,
});

/**
 * The home console used to label its focus panel with
 * `groupRoadmapByQuarter(...)[0]`, which is the EARLIEST quarter on record and
 * therefore said "Now Â· 2026-Q2" forever. Focus follows status, not the
 * calendar order of the backlog.
 */
describe('currentFocus', () => {
  test('returns the items actually marked now', () => {
    const focus = currentFocus([
      item('old', '2026-Q2', 'done'),
      item('live', '2026-Q3', 'now'),
      item('soon', '2026-Q4', 'next'),
    ]);
    expect(focus?.items.map((i) => i.id)).toEqual(['live']);
    expect(focus?.quarter).toBe('2026-Q3');
  });

  test('falls back to what is next when nothing is in flight', () => {
    const focus = currentFocus([item('old', '2026-Q2', 'done'), item('soon', '2026-Q4', 'next')]);
    expect(focus?.items.map((i) => i.id)).toEqual(['soon']);
    expect(focus?.quarter).toBe('2026-Q4');
  });

  test('labels with the earliest quarter that has live work', () => {
    const focus = currentFocus([item('a', '2026-Q4', 'now'), item('b', '2026-Q3', 'now')]);
    expect(focus?.quarter).toBe('2026-Q3');
  });

  test('is null when the roadmap is empty or fully done', () => {
    expect(currentFocus([])).toBeNull();
    expect(currentFocus([item('a', '2026-Q2', 'done')])).toBeNull();
  });
});

/**
 * The seed is now empty â€” no demo roadmap items.
 * The OS starts with an empty roadmap; create your own items in the OS.
 */
describe('empty roadmap seed (no demo data)', () => {
  const db = openDb(':memory:');
  seedDatabase(db);
  const items = db.roadmap.all();

  test('roadmap is empty after seeding', () => {
    expect(items).toHaveLength(0);
  });

  test('currentFocus on empty roadmap returns null', () => {
    expect(currentFocus(items)).toBeNull();
  });

  test('groupRoadmapByQuarter on empty roadmap returns empty', () => {
    expect(groupRoadmapByQuarter(items)).toHaveLength(0);
  });
});

describe('roadmap rows that leave the seed leave the database', () => {
  test('deleteWhereIdNotIn drops stale rows', () => {
    const db = openDb(':memory:');
    db.roadmap.insert(item('rm-keep', '2026-Q3', 'now'));
    db.roadmap.insert(item('rm-ghost', '2026-Q2', 'now'));
    db.roadmap.deleteWhereIdNotIn(['rm-keep']);
    expect(db.roadmap.all().map((i) => i.id)).toEqual(['rm-keep']);
  });

  test('re-seeding does not prune roadmap (not structural data)', () => {
    const db = openDb(':memory:');
    db.roadmap.insert(item('rm-creds-notion', '2026-Q2', 'now'));
    seedDatabase(db);
    // roadmap is not structural data â€” seed doesn't prune it
    // but since the seed is empty, the item remains (user data)
    expect(db.roadmap.all().some((i) => i.id === 'rm-creds-notion')).toBe(true);
  });
});

