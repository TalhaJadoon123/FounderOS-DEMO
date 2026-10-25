import { beforeAll, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The systems page probes every provider on render. That is correct in
// production but would make this render-only net hit the network 30 times, so
// the page is exercised against a deterministic empty board here.
vi.mock('@/lib/jarvis/systems', () => ({
  listSystems: async () => ({
    systems: [],
    counts: { total: 0, connected: 0, notConfigured: 0, error: 0, selfServiceConnected: 0 },
    lastProbeAt: null,
    newlyConnected: [],
    lost: [],
    needsKeys: [],
  }),
}));

// Pages read the DB path at first access, so point it at a fresh seeded temp DB
// before any page module is imported. FUNNEL_PROVIDER keeps /funnel off the
// live Attio API in tests.
beforeAll(() => {
  process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-smoke-')), 'test.db');
  process.env.FUNNEL_PROVIDER = 'seed';
});

type PageEntry = {
  file: string; // path relative to app/, the source of truth for coverage
  // props is `any` so strongly-typed page components (e.g. /org's searchParams)
  // remain assignable to this generic invoker.
  load: () => Promise<{ default: (props?: any) => unknown }>;
  props?: unknown;
};

// Every app/**/page.tsx, with the props each needs to be invoked.
const PAGES: PageEntry[] = [
  { file: 'page.tsx', load: () => import('@/app/page') },
  { file: 'comms/page.tsx', load: () => import('@/app/comms/page') },
  { file: 'social/page.tsx', load: () => import('@/app/social/page') },
  { file: 'social/beehiiv/page.tsx', load: () => import('@/app/social/beehiiv/page') },
  { file: 'content/page.tsx', load: () => import('@/app/content/page') },
  { file: 'content/lead-magnets/page.tsx', load: () => import('@/app/content/lead-magnets/page') },
  { file: 'agents/page.tsx', load: () => import('@/app/agents/page') },
  { file: 'chats/page.tsx', load: () => import('@/app/chats/page') },
  { file: 'tasks/page.tsx', load: () => import('@/app/tasks/page') },
  { file: 'skills/page.tsx', load: () => import('@/app/skills/page') },
  { file: 'org/page.tsx', load: () => import('@/app/org/page'), props: { searchParams: {} } },
  { file: 'brain/page.tsx', load: () => import('@/app/brain/page') },
  { file: 'brand-deals/page.tsx', load: () => import('@/app/brand-deals/page') },
  { file: 'adpilot/page.tsx', load: () => import('@/app/adpilot/page') },
  { file: 'blueprint/page.tsx', load: () => import('@/app/blueprint/page') },
  { file: 'doctor/page.tsx', load: () => import('@/app/doctor/page') },
  { file: 'finances/page.tsx', load: () => import('@/app/finances/page') },
  { file: 'trading/page.tsx', load: () => import('@/app/trading/page') },
  { file: 'usage/page.tsx', load: () => import('@/app/usage/page') },
  { file: 'funnel/page.tsx', load: () => import('@/app/funnel/page'), props: { searchParams: {} } },
  { file: 'workflows/page.tsx', load: () => import('@/app/workflows/page') },
  { file: 'integrations/page.tsx', load: () => import('@/app/integrations/page') },
  { file: 'roadmap/page.tsx', load: () => import('@/app/roadmap/page') },
  { file: 'analytics/page.tsx', load: () => import('@/app/analytics/page') },
  { file: 'reference/page.tsx', load: () => import('@/app/reference/page') },
  { file: 'personas/page.tsx', load: () => import('@/app/personas/page') },
  { file: 'jarvis/page.tsx', load: () => import('@/app/jarvis/page') },
  { file: 'jarvis/settings/page.tsx', load: () => import('@/app/jarvis/settings/page'), props: { searchParams: {} } },
  { file: 'jarvis/systems/page.tsx', load: () => import('@/app/jarvis/systems/page') },
  // api-docs is a client component (uses useState/useEffect) — not testable as a server render
];

function discoverPages(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...discoverPages(path.join(dir, entry.name), rel));
    else if (entry.name === 'page.tsx') {
      // Client components (with 'use client') cannot be rendered in the
      // server-only smoke test. Filter them out so the coverage net matches.
      // Also filter pages that honestly 404 when unseeded (e.g. social/[platform]).
      if (!rel.startsWith('api-docs/') && rel !== 'social/[platform]/page.tsx') out.push(rel);
    }
  }
  return out;
}

describe('platform smoke — every page renders without throwing', () => {
  // 20s: pages that shell out to the gbrain CLI or distill the brain-store
  // (/, /brain) legitimately exceed vitest's 5s default under a loaded
  // parallel suite — this is a does-it-throw net, not a performance gate.
  test.each(PAGES)('$file renders', async ({ load, props }) => {
    const mod = await load();
    const Page = mod.default;
    // Server components run their body (DB reads, data fetch) when invoked;
    // a throw here is exactly the failure we want to catch.
    await expect(Promise.resolve(Page(props))).resolves.toBeTruthy();
  }, 60_000);

  test('the smoke net covers every app/**/page.tsx (no page escapes)', () => {
    const discovered = discoverPages(path.join(process.cwd(), 'app'))
      .filter((p) => !p.includes('social/[platform]'))
      .sort();
    const covered = PAGES.map((p) => p.file)
      .filter((p) => !p.includes('social/[platform]'))
      .sort();
    expect(covered).toEqual(discovered);
  });
});
