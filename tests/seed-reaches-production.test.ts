import { describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { SEED_VERSION, seedDatabase } from '@/lib/seed';

/**
 * The seed is now minimal â€” only structural data (departments, agents, crons).
 * All other tables start empty and stay empty until real data arrives.
 * No demo tools, agents, SOP tasks, etc. are seeded.
 */
describe('minimal seed reaches production â€” only structural data is seeded', () => {
  test('seedDatabase records the current version', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    expect(db.meta.get('seed_version')).toBe(SEED_VERSION);
    db.close();
  });

  test('a database stamped with an older version is out of date', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    db.meta.set('seed_version', '0');
    expect(db.meta.get('seed_version')).not.toBe(SEED_VERSION);
    // re-seeding brings it back up to date, which is what getDb() relies on
    seedDatabase(db);
    expect(db.meta.get('seed_version')).toBe(SEED_VERSION);
    db.close();
  });

  test('getDb re-seeds on a version mismatch, not only on an empty table', () => {
    const src = readSource('lib/data.ts');
    expect(src).toContain('SEED_VERSION');
    expect(src).toContain("meta.get('seed_version')");
  });
});

describe('trading seed eviction on real data', () => {
  test('seeded trading rows stay out once a real broker snapshot exists', () => {
    const db = openDb(':memory:');
    seedDatabase(db);

    // the host's state: an agent has pushed a real Robinhood snapshot
    db.trading.recordSnapshot(
      {
        accountId: 'individual', accountLabel: 'Individual', capturedAt: '2030-01-01T00:00:00.000Z',
        accountValueUsd: 999_999, buyingPowerUsd: 1, cashUsd: 1, dayPnlUsd: 0, totalPnlUsd: 0,
        source: 'robinhood',
      },
      [],
    );
    const before = db.trading.activity().length;

    // a SEED_VERSION bump re-runs the whole seed against that database
    seedDatabase(db);

    expect(db.trading.latestSnapshot()?.source).toBe('robinhood');
    expect(db.trading.activity().length, 'seeded trades came back').toBe(before);
    db.close();
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
function readSource(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8');
}

