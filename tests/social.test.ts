import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { SocialAccountSchema, SocialSnapshotSchema, type SocialSnapshot } from '@/lib/schemas';
import {
  allTimeGrowthPct,
  buildSocialDashboard,
  growthPct,
  platformDetail,
  syncSocialSnapshots,
} from '@/lib/social';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

const snap = (platform: string, capturedAt: string, followers: number): SocialSnapshot =>
  SocialSnapshotSchema.parse({ platform, capturedAt, followers, source: 'test' });

describe('social schemas', () => {
  test('accepts the five tracked platforms only', () => {
    expect(() =>
      SocialAccountSchema.parse({ platform: 'myspace', handle: '@x', url: null, order: 1 }),
    ).toThrow();
    expect(() =>
      SocialAccountSchema.parse({ platform: 'instagram', handle: '@founderos.ai', url: null, order: 1 }),
    ).not.toThrow();
  });

  test('snapshots require a YYYY-MM-DD capture date', () => {
    expect(() => snap('instagram', 'June 13', 100)).toThrow();
    expect(() => snap('instagram', '2026-06-13', 100)).not.toThrow();
  });
});

describe('social repo', () => {
  test('round-trips accounts ordered by their order column', () => {
    db = openDb(':memory:');
    db.social.upsertAccount({ platform: 'tiktok', handle: '@founderos.ai', url: null, order: 2 });
    db.social.upsertAccount({ platform: 'instagram', handle: '@founderos.ai', url: null, order: 1 });
    expect(db.social.accounts().map((a) => a.platform)).toEqual(['instagram', 'tiktok']);
  });

  test('upserting the same platform replaces instead of duplicating', () => {
    db = openDb(':memory:');
    db.social.upsertAccount({ platform: 'twitter', handle: '@old', url: null, order: 1 });
    db.social.upsertAccount({ platform: 'twitter', handle: '@Founderosai', url: null, order: 1 });
    expect(db.social.accounts()).toHaveLength(1);
    expect(db.social.accounts()[0].handle).toBe('@Founderosai');
  });

  test('returns snapshots for a platform in chronological order', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-10', 40000));
    db.social.insertSnapshot(snap('instagram', '2026-06-01', 39000));
    db.social.insertSnapshot(snap('tiktok', '2026-06-10', 9900));
    expect(db.social.snapshots('instagram').map((s) => s.capturedAt)).toEqual([
      '2026-06-01',
      '2026-06-10',
    ]);
  });

  test('same-day snapshot for a platform replaces the earlier capture', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-13', 40000));
    db.social.insertSnapshot(snap('instagram', '2026-06-13', 40100));
    const rows = db.social.snapshots('instagram');
    expect(rows).toHaveLength(1);
    expect(rows[0].followers).toBe(40100);
  });

  test('latest() returns the newest snapshot per platform', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-01', 39000));
    db.social.insertSnapshot(snap('instagram', '2026-06-10', 40000));
    db.social.insertSnapshot(snap('tiktok', '2026-06-05', 9900));
    const latest = db.social.latest();
    expect(latest).toHaveLength(2);
    expect(latest.find((s) => s.platform === 'instagram')?.followers).toBe(40000);
  });
});

describe('growthPct', () => {
  test('computes percentage growth across the window', () => {
    const series = [snap('instagram', '2026-06-01', 1000), snap('instagram', '2026-06-08', 1100)];
    expect(growthPct(series, 7)).toBeCloseTo(10);
  });

  test('uses the most recent snapshot at or before the window start as baseline', () => {
    const series = [
      snap('instagram', '2026-06-01', 1000),
      snap('instagram', '2026-06-05', 1050),
      snap('instagram', '2026-06-12', 1155),
    ];
    expect(growthPct(series, 7)).toBeCloseTo(10);
  });

  test('is null when history does not reach back far enough', () => {
    const series = [snap('instagram', '2026-06-12', 1000), snap('instagram', '2026-06-13', 1010)];
    expect(growthPct(series, 7)).toBeNull();
  });

  test('is null with fewer than two snapshots or a zero baseline', () => {
    expect(growthPct([snap('instagram', '2026-06-13', 1000)], 7)).toBeNull();
    expect(growthPct([], 7)).toBeNull();
    expect(
      growthPct([snap('youtube', '2026-06-01', 0), snap('youtube', '2026-06-08', 50)], 7),
    ).toBeNull();
  });

  test('allTimeGrowthPct compares earliest to latest', () => {
    const series = [snap('tiktok', '2026-01-01', 5000), snap('tiktok', '2026-06-13', 12000)];
    expect(allTimeGrowthPct(series)).toBeCloseTo(140);
    expect(allTimeGrowthPct([snap('tiktok', '2026-06-13', 12000)])).toBeNull();
  });
});

describe('syncSocialSnapshots', () => {
  test('records a snapshot today for every tracked platform with a follower count', () => {
    db = openDb(':memory:');
    const recorded = syncSocialSnapshots(
      db,
      {
        instagram: { handle: '@founderos.ai', followers: 42000 },
        tiktok: { handle: '@founderos.ai', followers: 12000 },
        facebook: { handle: 'Talha', followers: 100 },
        linkedin: { handle: 'Talha' },
      },
      '2026-06-13',
    );
    expect(recorded).toBe(2);
    expect(db.social.snapshots('instagram')).toEqual([
      { platform: 'instagram', capturedAt: '2026-06-13', followers: 42000, source: 'zernio-config' },
    ]);
    expect(db.social.snapshots('linkedin')).toEqual([]);
  });

  test('re-syncing the same day overwrites rather than duplicates', () => {
    db = openDb(':memory:');
    syncSocialSnapshots(db, { instagram: { followers: 42000 } }, '2026-06-13');
    syncSocialSnapshots(db, { instagram: { followers: 40100 } }, '2026-06-13');
    const rows = db.social.snapshots('instagram');
    expect(rows).toHaveLength(1);
    expect(rows[0].followers).toBe(40100);
  });
});

describe('buildSocialDashboard — honest empty state (no demo data)', () => {
  test('returns empty platforms list when no accounts are seeded', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const dash = buildSocialDashboard(db);
    expect(dash.platforms).toHaveLength(0);
    expect(dash.totalFollowers).toBe(0);
    expect(dash.asOf).toBeNull();
  });
});

describe('platformDetail', () => {
  test('returns null for a platform that is not tracked', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(platformDetail(db, 'myspace' as never)).toBeNull();
  });

  test('returns null for a tracked platform with no seeded data', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(platformDetail(db, 'instagram')).toBeNull();
  });
});

describe('no seeded social data', () => {
  test('no accounts are seeded', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.social.accounts()).toHaveLength(0);
  });

  test('no snapshots are seeded', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.social.snapshots('instagram')).toHaveLength(0);
    expect(db.social.snapshots('linkedin')).toHaveLength(0);
  });

  test('re-seeding stays empty', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    seedDatabase(db);
    expect(db.social.accounts()).toHaveLength(0);
  });
});