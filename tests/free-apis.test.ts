import { describe, expect, test, vi, afterEach } from 'vitest';
import {
  FREE_API_IDS,
  freeApiSpecs,
  freeApiStatus,
  freeApiStatuses,
} from '@/lib/connectors/free-apis';
import { allConnectorStatuses, connectorStatusById } from '@/lib/connectors';

/**
 * The keyless public sources must stay honest: no key required, real state
 * reported, and no network at import time. These run fully offline.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('free API catalogue', () => {
  test('every source declares an id, a name, a purpose and an honest limits note', () => {
    const specs = freeApiSpecs();
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(spec.id).toMatch(/^free-[a-z0-9-]+$/);
      expect(spec.name.length).toBeGreaterThan(0);
      expect(spec.purpose.length).toBeGreaterThan(0);
      // The whole point of this file: no card, no signup, no key.
      expect(spec.limits.toLowerCase()).toMatch(/free|no key|keyless|public/);
    }
  });

  test('ids are unique and namespaced so they cannot collide with a paid connector', () => {
    expect(new Set(FREE_API_IDS).size).toBe(FREE_API_IDS.length);
    for (const id of FREE_API_IDS) expect(id.startsWith('free-')).toBe(true);
  });
});

describe('freeApiStatus', () => {
  test('an unknown id is null, never a fabricated row', async () => {
    expect(await freeApiStatus('free-does-not-exist')).toBeNull();
  });

  test('a reachable source reports connected with its probe numbers in the detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ base: 'USD', date: '2026-10-05', rates: { EUR: 0.9, GBP: 0.8 } }), { status: 200 }))
    );
    const status = await freeApiStatus('free-frankfurter');
    expect(status?.state).toBe('connected');
    // The first numeric probe value is what leads the status line.
    expect(status?.detail).toContain('pairs 2');
    expect(status?.detail).toContain('EUR 0.9');
  });

  test('an unreachable source reports error with the reason, never a fake green light', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    const status = await freeApiStatus('free-hackernews');
    expect(status?.state).toBe('error');
    expect(status?.detail).toContain('unreachable');
  });

  test('a non-200 response is treated as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    const status = await freeApiStatus('free-worldbank');
    expect(status?.state).toBe('error');
    expect(status?.detail).toContain('503');
  });
});

describe('freeApiStatuses', () => {
  test('returns one honest status per catalogue entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ rates: {}, base: 'USD', date: '2026-10-05' }), { status: 200 }))
    );
    const all = await freeApiStatuses();
    expect(all).toHaveLength(freeApiSpecs().length);
    for (const status of all) {
      expect(['connected', 'error', 'not_configured']).toContain(status.state);
    }
  });
});

describe('free sources on the integrations board', () => {
  test('every free source is registered as a check, so connectorStatusById finds it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ rates: {}, base: 'USD', date: '2026-10-05' }), { status: 200 }))
    );
    for (const id of FREE_API_IDS) {
      const status = await connectorStatusById(id);
      expect(status, `${id} should resolve`).not.toBeNull();
      expect(status?.id).toBe(id);
    }
  });

  test('allConnectorStatuses includes the free sources rather than dropping them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ rates: {}, base: 'USD', date: '2026-10-05' }), { status: 200 }))
    );
    const all = await allConnectorStatuses();
    const ids = new Set(all.map((s) => s.id));
    for (const id of FREE_API_IDS) expect(ids.has(id), `${id} missing from the board`).toBe(true);
  });
});