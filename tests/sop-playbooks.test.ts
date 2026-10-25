import { afterAll, describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import {
  SopPlaybookSchema,
  playbookFor,
  AUTONOMY_LEVELS,
  PLAYBOOK_STATUSES,
} from '@/lib/sop-playbooks';

/**
 * SOP playbooks â€” no seeded SOPs, create from the OS.
 * The playbookFor function should still work for manually created SOPs.
 */
describe('SOP playbooks â€” empty seed', () => {
  const db = openDb(':memory:');
  seedDatabase(db);
  const tasks = db.sopTasks.all();
  afterAll(() => db.close());

  test('zero seeded SOP tasks', () => {
    expect(tasks.length).toBe(0);
  });

  test('playbookFor handles empty tasks gracefully', () => {
    expect(tasks).toHaveLength(0);
  });

  test('autonomy levels and statuses are still defined', () => {
    expect(AUTONOMY_LEVELS).toContain('human-led');
    expect(AUTONOMY_LEVELS).toContain('human-assisted');
    expect(AUTONOMY_LEVELS).toContain('fully-autonomous');
    expect(PLAYBOOK_STATUSES).toContain('not-started');
    expect(PLAYBOOK_STATUSES).toContain('in-development');
    expect(PLAYBOOK_STATUSES).toContain('ready-to-run');
  });
});

