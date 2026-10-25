import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Route handlers read the DB path from FOUNDER_OS_DB at first access, so the
// env var must be set before any handler module is imported. FUNNEL_PROVIDER
// pins /api/funnel to the seeded set — tests never hit the live Attio API.
beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-test-')), 'test.db');
  process.env.FUNNEL_PROVIDER = 'seed';
});

describe('API route handlers — honest empty states (no demo data)', () => {
  test('GET /api/agents returns agents grouped with their department', async () => {
    const { GET } = await import('@/app/api/agents/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.agents)).toBe(true);
    // Only the 13 minimal seed agents
    expect(body.agents.length).toBe(13);
    expect(body.agents[0]).toHaveProperty('name');
    expect(body.agents[0]).toHaveProperty('departmentId');
  });

  test('GET /api/departments returns ordered departments', async () => {
    const { GET } = await import('@/app/api/departments/route');
    const res = await GET();
    const body = await res.json();
    // 6 departments in the minimal seed
    expect(body.departments.length).toBe(6);
    const orders = body.departments.map((d: { order: number }) => d.order);
    expect([...orders].sort((a: number, b: number) => a - b)).toEqual(orders);
  });

  test('GET /api/tools returns empty integrations grid (no demo tools)', async () => {
    const { GET } = await import('@/app/api/tools/route');
    const res = await GET();
    const body = await res.json();
    expect(body.tools).toHaveLength(0);
  });

  test('POST /api/agents/[id]/run executes a real agent and persists the run', async () => {
    const { POST } = await import('@/app/api/agents/[id]/run/route');
    const res = await POST(new Request('http://localhost/api/agents/conductor/run', { method: 'POST' }), {
      params: { id: 'conductor' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.agentId).toBe('conductor');
    expect(typeof body.run.ok).toBe('boolean');
    expect(body.run.summary.length).toBeGreaterThan(0);
  });

  test('GET /api/roadmap returns empty quarters (no demo roadmap)', async () => {
    const { GET } = await import('@/app/api/roadmap/route');
    const res = await GET();
    const body = await res.json();
    expect(body.quarters).toHaveLength(0);
  });

  test('GET /api/metrics returns 4 live metrics (some may be null if keys missing)', async () => {
    const { GET } = await import('@/app/api/metrics/route');
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body.metrics)).toBe(true);
    expect(body.metrics.length).toBe(4);
    // All 4 metrics present; some may be live=false if keys not configured
    const keys = body.metrics.map((m: { key: string }) => m.key).sort();
    // The liveMetrics returns: brain_pages, stripe_available, unread_total, agent_runs
    expect(keys).toEqual(['agent_runs', 'brain_pages', 'stripe_available', 'unread_total']);
    for (const m of body.metrics) {
      expect(typeof m.live).toBe('boolean');
      if (m.live) expect(typeof m.value).toBe('number');
      else expect(m.value).toBeNull();
    }
  });

  test('POST /api/agents/broadcast fans a message out to every agent', async () => {
    const { POST } = await import('@/app/api/agents/broadcast/route');
    const { realAgents } = await import('@/lib/agents/real');
    const res = await POST(
      new Request('http://localhost/api/agents/broadcast', {
        method: 'POST',
        body: JSON.stringify({ message: 'status report, everyone' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.broadcast.message).toBe('status report, everyone');
    // Broadcast runs all realAgents (32), not just seeded agents
    expect(body.broadcast.replies.length).toBe(realAgents.length);
    for (const reply of body.broadcast.replies) {
      expect(typeof reply.ok).toBe('boolean');
      expect(reply.reply.length).toBeGreaterThan(0);
    }
  }, 30_000);

  test('POST /api/agents/broadcast rejects an empty message', async () => {
    const { POST } = await import('@/app/api/agents/broadcast/route');
    const res = await POST(
      new Request('http://localhost/api/agents/broadcast', { method: 'POST', body: JSON.stringify({ message: ' ' }) }),
    );
    expect(res.status).toBe(400);
  });

  test('GET /api/brain/overview returns the store tree and doctor checks', async () => {
    const { GET } = await import('@/app/api/brain/overview/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.store.path.length).toBeGreaterThan(0);
    expect(body.store.totalFiles).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.store.folders)).toBe(true);
    expect(typeof body.doctor.connected).toBe('boolean');
    expect(Array.isArray(body.doctor.checks)).toBe(true);
    expect(body.doctor.detail.length).toBeGreaterThan(0);
  });

  test('GET /api/social returns empty growth dashboard (no demo data)', async () => {
    const { GET } = await import('@/app/api/social/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // No seeded social accounts — empty platforms
    expect(body.platforms).toHaveLength(0);
    expect(body.totalFollowers).toBe(0);
    expect(body.totalDms).toBe(0);
    expect(body.emailList.subscribers).toBeNull(); // no data = null
  });

  test('GET /api/social includes empty email list and DM total', async () => {
    const { GET } = await import('@/app/api/social/route');
    const res = await GET();
    const body = await res.json();
    expect(body.emailList.subscribers).toBeNull(); // no data = null
    expect(body.totalDms).toBe(0);
    expect('monthlyGrowthPct' in body).toBe(true);
  });

  test('GET /api/social/series returns empty series with ranges', async () => {
    const { GET } = await import('@/app/api/social/series/route');
    const aud = await GET(new Request('http://localhost/api/social/series?metric=audience'));
    expect(aud.status).toBe(200);
    const audBody = await aud.json();
    expect(audBody.metric).toBe('audience');
    expect(audBody.ranges).toEqual([7, 30, 60, 'all']);
    // The 'all' series is always returned (with empty points when no data)
    expect(audBody.series).toHaveLength(1);
    expect(audBody.series[0].key).toBe('all');
    expect(audBody.series[0].points).toHaveLength(0);

    const dms = await GET(new Request('http://localhost/api/social/series?metric=dms'));
    const dmsBody = await dms.json();
    expect(dmsBody.metric).toBe('dms');
    expect(dmsBody.series).toHaveLength(1);
    expect(dmsBody.series[0].key).toBe('total');
    expect(dmsBody.series[0].points).toHaveLength(0);
  });

  test('GET /api/social/series rejects an unknown metric', async () => {
    const { GET } = await import('@/app/api/social/series/route');
    const res = await GET(new Request('http://localhost/api/social/series?metric=bogus'));
    expect(res.status).toBe(400);
  });

  test('GET /api/funnel returns empty summary + journeys (no demo data)', async () => {
    const { GET } = await import('@/app/api/funnel/route');
    const res = await GET(new Request('http://localhost/api/funnel'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.clients).toBe(0);
    expect(body.journeys).toHaveLength(0);
    expect(body.archived).toHaveLength(0);
  });

  test('GET /api/funnel?venture= returns empty journeys', async () => {
    const { GET } = await import('@/app/api/funnel/route');
    const res = await GET(new Request('http://localhost/api/funnel?venture=vantage'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.journeys).toHaveLength(0);
  });

  test('GET /api/funnel rejects an unknown venture', async () => {
    const { GET } = await import('@/app/api/funnel/route');
    const res = await GET(new Request('http://localhost/api/funnel?venture=bogus'));
    expect(res.status).toBe(400);
  });

  test('GET /api/social exposes empty audience + DM growth across ranges', async () => {
    const { GET } = await import('@/app/api/social/route');
    const res = await GET();
    const body = await res.json();
    for (const key of ['d7', 'd30', 'd60', 'allTime']) {
      expect(key in body.audienceGrowth).toBe(true);
      expect(key in body.dmGrowth).toBe(true);
      expect(body.audienceGrowth[key]).toBeNull(); // null = no data
      expect(body.dmGrowth[key]).toBeNull();
    }
    expect(body.audienceTotal).toBe(0);
  });

  test('POST /api/social/posts enqueues a post; GET lists the queue', async () => {
    const route = await import('@/app/api/social/posts/route');
    const post = await route.POST(
      new Request('http://localhost/api/social/posts', {
        method: 'POST',
        body: JSON.stringify({ caption: 'launch day 🚀', platforms: ['instagram', 'tiktok'] }),
      }),
    );
    expect(post.status).toBe(201);
    const created = await post.json();
    expect(created.post.status).toBe('queued');
    expect(created.post.platforms).toEqual(['instagram', 'tiktok']);

    const list = await route.GET();
    const body = await list.json();
    expect(body.posts.some((p: { id: string }) => p.id === created.post.id)).toBe(true);
  });

  test('POST /api/social/posts rejects an empty caption or no platforms', async () => {
    const route = await import('@/app/api/social/posts/route');
    const bad = await route.POST(
      new Request('http://localhost/api/social/posts', {
        method: 'POST',
        body: JSON.stringify({ caption: '', platforms: [] }),
      }),
    );
    expect(bad.status).toBe(400);
  });

  test('GET /api/social/[platform] 404s for untracked platform (no seed accounts)', async () => {
    const { GET } = await import('@/app/api/social/[platform]/route');
    const res = await GET(new Request('http://localhost/api/social/instagram'), {
      params: { platform: 'instagram' },
    });
    expect(res.status).toBe(404);
  });

  test('GET /api/social/[platform] 404s for an untracked platform', async () => {
    const { GET } = await import('@/app/api/social/[platform]/route');
    const res = await GET(new Request('http://localhost/api/social/myspace'), {
      params: { platform: 'myspace' },
    });
    expect(res.status).toBe(404);
  });

  test('GET /api/brain reports the real brain status, both halves named', async () => {
    const { GET } = await import('@/app/api/brain/route');
    const res = await GET(new Request('http://localhost/api/brain'));
    const body = await res.json();
    expect(body.provider).toBe('federated');
    expect(typeof body.connected).toBe('boolean');
    expect(body.detail.length).toBeGreaterThan(0);
  });

  test('GET /api/brain?q= runs a brain search through the provider', async () => {
    const previous = process.env.BRAIN_PROVIDER;
    process.env.BRAIN_PROVIDER = 'stub';
    try {
      const { GET } = await import('@/app/api/brain/route');
      const res = await GET(new Request('http://localhost/api/brain?q=vantage%20pool%20split'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.query).toBe('vantage pool split');
      expect(body.provider).toBe('stub');
      expect(Array.isArray(body.results)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.BRAIN_PROVIDER;
      else process.env.BRAIN_PROVIDER = previous;
    }
  });
});

describe('GET /api/funnel/lead-message — last thread for the dossier (AC54)', () => {
  test('400 when no name is given', async () => {
    const { GET } = await import('@/app/api/funnel/lead-message/route');
    const res = await GET(new Request('http://localhost/api/funnel/lead-message'));
    expect(res.status).toBe(400);
  });

  test('answers a well-formed shape for a lead with no thread', async () => {
    const { GET } = await import('@/app/api/funnel/lead-message/route');
    const res = await GET(
      new Request('http://localhost/api/funnel/lead-message?name=Nonexistent%20Lead%20XYZQ&email=nobody%40example.invalid'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // either an honest miss or an honest "feed unavailable" — never a guess
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('unavailable');
    if (!body.unavailable) expect(body.message).toBeNull();
  });
});