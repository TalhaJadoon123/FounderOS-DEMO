import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * Free, no-card, no-signup data sources.
 *
 * Every connector in this repo follows one rule: report the truth, never fake a
 * green light. That rule cuts both ways. Most connectors here need a paid plan
 * or a signup (Stripe, Attio, Slack), which is exactly why a $0 setup shows a
 * wall of "not_configured". These are the exceptions — APIs that are genuinely
 * free and genuinely public — so the board reflects real capability instead of
 * looking inert.
 *
 * All of them are unauthenticated GETs. Nothing here needs a key, a card, or an
 * account, and none of them send anything outbound: they only read.
 *
 * Each entry states its real limits honestly rather than pretending otherwise.
 */

/** Shared fetch with a hard timeout, so one slow host cannot stall the board. */
async function getJson(url: string, timeoutMs = 4000): Promise<unknown> {
  const res = await fetch(url, {
    // cache: 'no-store' is mandatory on every connector GET. Next's production
    // Data Cache would otherwise hold these rows, and a board that reports
    // yesterday's reachability as "live" is the exact failure
    // tests/connector-cache.test.ts exists to prevent.
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json', 'user-agent': 'FounderOS/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

type FreeApiSpec = {
  id: string;
  name: string;
  kind: ConnectorStatus['kind'];
  /** Docs URL, surfaced in the integrations board. */
  href: string;
  /** What this source is actually good for inside the OS. */
  purpose: string;
  /** Honest note about the free tier's limits. */
  limits: string;
  probe: () => Promise<Record<string, string | number>>;
};

/**
 * World Bank's indicator API. No key, no quota, global coverage, and the
 * numbers are real rather than generated — useful as the macro layer behind
 * /finances and /analytics.
 */
async function worldBank(): Promise<Record<string, string | number>> {
  // Newest available annual world GDP (current US$), per the API's own "lastupdated".
  const data = (await getJson(
    'https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.CD?format=json&per_page=5&mrnev=1',
  )) as unknown[][];
  const row = Array.isArray(data?.[1]) ? (data[1][0] as Record<string, unknown>) : undefined;
  const year = row?.date;
  const value = typeof row?.value === 'number' ? row.value : undefined;
  return {
    indicator: 'World GDP (current US$)',
    ...(year ? { year: String(year) } : {}),
    ...(value !== undefined ? { value: Math.round(value) } : {}),
  };
}

/** Frankfurter: ECB reference rates. Free, no key, and no attribution nag. */
async function frankfurter(): Promise<Record<string, string | number>> {
  const data = (await getJson('https://api.frankfurter.app/latest?from=USD')) as Record<string, unknown>;
  const rates = (data.rates ?? {}) as Record<string, number>;
  // Order matters: pairs first so it is the first numeric key the status line
  // summarises, and the currency codes keep their uppercase so the board reads
  // "EUR 0.9" rather than "eur 0.9".
  return {
    base: String(data.base ?? 'USD'),
    date: String(data.date ?? ''),
    pairs: Object.keys(rates).length,
    EUR: rates.EUR ?? 0,
    GBP: rates.GBP ?? 0,
  };
}

/** Open-Meteo forecast. Keyless, and the free tier is genuinely generous. */
async function openMeteo(): Promise<Record<string, string | number>> {
  const data = (await getJson(
    'https://api.open-meteo.com/v1/forecast?latitude=51.5072&longitude=-0.1276&current=temperature_2m',
  )) as Record<string, unknown>;
  const current = (data.current ?? {}) as Record<string, unknown>;
  return {
    latitude: Number(data.latitude ?? 0),
    longitude: Number(data.longitude ?? 0),
    temperature_c: Number(current.temperature_2m ?? 0),
    observed_at: String(current.time ?? ''),
  };
}

/**
 * Hacker News' official Firebase API. No key, and it is the one genuinely
 * free source of engineering signal, which is what the content and agent
 * surfaces care about.
 */
async function hackerNews(): Promise<Record<string, string | number>> {
  const ids = (await getJson('https://hacker-news.firebaseio.com/v0/topstories.json')) as number[];
  const top = Array.isArray(ids) ? ids.slice(0, 5) : [];
  let fetched = 0;
  for (const id of top) {
    try {
      await getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 3000);
      fetched += 1;
    } catch {
      /* one bad story must not fail the probe */
    }
  }
  return { top_stories: top.length, readable: fetched, endpoint: 'topstories' };
}

/** GitHub's public search API. Unauthenticated is rate-limited but usable. */
async function githubPublic(): Promise<Record<string, string | number>> {
  const res = await fetch('https://api.github.com/search/repositories?q=topic:ai-agent&per_page=1', {
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'FounderOS/1.0',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const headers = res.headers;
  const remaining = headers.get('x-ratelimit-remaining');
  const limit = headers.get('x-ratelimit-limit');
  return {
    total_matching: Number(data.total_count ?? 0),
    ...(remaining ? { ratelimit_remaining: Number(remaining) } : {}),
    ...(limit ? { ratelimit_per_hour: Number(limit) } : {}),
  };
}

const SPECS: FreeApiSpec[] = [
  {
    id: 'free-worldbank',
    name: 'World Bank',
    kind: 'analytics',
    href: 'https://api.worldbank.org',
    purpose: 'Global macro indicators behind /finances and /analytics',
    limits: 'Free and keyless. Annual data lags by design; no intraday figures.',
    probe: worldBank,
  },
  {
    id: 'free-frankfurter',
    name: 'Frankfurter (ECB)',
    kind: 'payments',
    href: 'https://www.frankfurter.app',
    purpose: 'Reference FX rates for multi-currency revenue and expenses',
    limits: 'Free and keyless. ECB reference rates, published once per working day.',
    probe: frankfurter,
  },
  {
    id: 'free-open-meteo',
    name: 'Open-Meteo',
    kind: 'local',
    href: 'https://open-meteo.com',
    purpose: 'Keyless weather, useful for scheduling calls across time zones',
    limits: 'Free for non-commercial use. No key needed up to the daily call cap.',
    probe: openMeteo,
  },
  {
    id: 'free-hackernews',
    name: 'Hacker News',
    kind: 'knowledge',
    href: 'https://github.com/HackerNews/API',
    purpose: 'Engineering signal for content ideas and /brain grounding',
    limits: 'Official public API, no key, no published quota.',
    probe: hackerNews,
  },
  {
    id: 'free-github',
    name: 'GitHub public search',
    kind: 'knowledge',
    href: 'https://docs.github.com/en/rest',
    purpose: 'Repo and topic search for competitor and landscape research',
    limits: 'Free without a token, but rate-limited: 10 search requests/min, 60/hour.',
    probe: githubPublic,
  },
];

/** Every spec, for the integrations board to render without a live call. */
export function freeApiSpecs(): FreeApiSpec[] {
  return SPECS;
}

export const FREE_API_IDS = SPECS.map((s) => s.id);

function toStatus(spec: FreeApiSpec, state: ConnectorStatus['state'], detail: string): ConnectorStatus {
  return { id: spec.id, name: spec.name, kind: spec.kind, state, detail };
}

/**
 * Probe one source. Any failure is reported as `error` with the reason: these
 * are optional enrichment, so an offline box must never look like a broken app.
 */
export async function freeApiStatus(id: string): Promise<ConnectorStatus | null> {
  const spec = SPECS.find((s) => s.id === id);
  if (!spec) return null;
  try {
    const meta = await spec.probe();
    const summary = Object.entries(meta)
      .filter(([k, v]) => typeof v === 'number' && !/^(latitude|longitude)$/.test(k))
      .slice(0, 2)
      // Keep the probe's own key casing: these values are rendered in the
      // integrations board, where "EUR" reads as a currency and "eur" does not.
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    return toStatus(spec, 'connected', summary ? `${spec.purpose} — ${summary}` : spec.purpose);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return toStatus(spec, 'error', `${spec.purpose} — unreachable (${reason})`);
  }
}

/**
 * Probe every free source concurrently for the integrations board.
 *
 * freeApiStatus returns null only for an id outside the catalogue; here every
 * id comes from the catalogue, so a null would be a bug rather than a state.
 * Report it as an error row instead of letting `null` leak into the board.
 */
export async function freeApiStatuses(): Promise<ConnectorStatus[]> {
  const probed = await Promise.all(SPECS.map((s) => freeApiStatus(s.id)));
  return probed.map((status, i) => {
    if (status) return status;
    const spec = SPECS[i];
    return { id: spec.id, name: spec.name, kind: spec.kind, state: 'error', detail: `${spec.purpose} — probe returned nothing` };
  });
}