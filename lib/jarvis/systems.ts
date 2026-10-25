/**
 * Jarvis systems — the live connection board for every external system.
 *
 * "Connected" here has one meaning: the connector's own probe reached the
 * provider on this load. No key is treated as connected, no demo flag turns a
 * row green, and there is no fallback that fabricates a provider response.
 *
 * "Probe all" is the real connect-all operation: it re-runs every connector
 * check, persists the result, and reports which systems came online and which
 * still need a credential or a local install.
 */

import { allConnectorStatuses, connectorStatusById } from '@/lib/connectors/index';
import type { ConnectorStatus } from '@/lib/connectors/types';
import { INTEGRATIONS } from '@/lib/integrations-catalog';
import { getDb } from '@/lib/data';

export type SystemStatus = ConnectorStatus & {
  /** Integration catalog slug, when the system is in the marketplace. */
  slug: string | null;
  /** True when the connector needs no operator credential to come online. */
  selfService: boolean;
  /** What the operator must provide before this can connect. */
  needs: string[];
};

export type SystemCounts = {
  total: number;
  connected: number;
  notConfigured: number;
  error: number;
  selfServiceConnected: number;
};

export type SystemsReport = {
  systems: SystemStatus[];
  counts: SystemCounts;
  lastProbeAt: string | null;
  newlyConnected: string[];
  lost: string[];
  needsKeys: string[];
};

/** Systems whose probe needs no credential. */
const SELF_SERVICE_IDS = new Set([
  'free-worldbank',
  'free-frankfurter',
  'free-open-meteo',
  'free-hackernews',
  'free-github',
  'loom',
]);

/** What each system needs before its live probe can pass. */
const NEEDS: Record<string, string[]> = {
  gbrain: ['gbrain CLI on PATH', 'GBRAIN_STORE / knowledge/brain-store'],
  llm: ['AI_GATEWAY_API_KEY (or a real LLM provider key)'],
  paperclip: ['PAPERCLIP_API_URL', 'PAPERCLIP_BOARD_KEY', 'PAPERCLIP_COMPANY_ID'],
  whatsapp: ['WhatsApp desktop installed and signed in'],
  zernio: ['ZERNIO_API_KEY'],
  beehiiv: ['BEEHIIV_API_KEY', 'BEEHIIV_PUBLICATION_ID'],
  manychat: ['MANYCHAT_API_KEY'],
  attio: ['ATTIO_API_KEY'],
  trakyo: ['TRAKYO_API_KEY'],
  fathom: ['FATHOM_API_KEY'],
  plaud: ['PLAUD_REFRESH_TOKEN'],
  docusign: [
    'DOCUSIGN_INTEGRATION_KEY',
    'DOCUSIGN_USER_ID',
    'DOCUSIGN_ACCOUNT_ID',
    'DOCUSIGN_PRIVATE_KEY_B64',
  ],
  'meta-ads': ['META_ADS_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
  ghl: ['GHL_API_KEY', 'GHL_LOCATION_ID'],
  arcads: ['ARCADS_BASIC_AUTH'],
  wispr: ['Wispr Flow desktop installed'],
  'local-stack': [
    'PAPERCLIP_API_URL',
    'HERMES_GATEWAY_URL',
    'gbrain, ffmpeg, pdftotext, whisper, gh on PATH',
  ],
  obsidian: ['OBSIDIAN_VAULT path'],
  miro: ['MIRO_ACCESS_TOKEN'],
  email: ['INBOX_1_HOST / INBOX_1_USER / INBOX_1_PASS (up to 4 slots)'],
  calendar: ['Google app password on an INBOX_* slot'],
  slack: ['SLACK_BOT_TOKEN', 'SLACK_ANNOUNCE_CHANNEL'],
  payments: ['STRIPE_SECRET_KEY (or another configured processor)'],
  robinhood: ['A trading agent pushing POST /api/trading/snapshot'],
  loom: [],
};

/** Integration marketplace link per connector id. */
const SLUG_BY_CONNECTOR = new Map(
  INTEGRATIONS.filter((i) => i.connectorId).map((i) => [i.connectorId as string, i.slug]),
);

function decorate(statuses: ConnectorStatus[]): SystemStatus[] {
  return statuses.map((status) => ({
    ...status,
    slug: SLUG_BY_CONNECTOR.get(status.id) ?? null,
    selfService: SELF_SERVICE_IDS.has(status.id),
    needs: NEEDS[status.id] ?? [],
  }));
}

function count(systems: SystemStatus[]): SystemCounts {
  return {
    total: systems.length,
    connected: systems.filter((s) => s.state === 'connected').length,
    notConfigured: systems.filter((s) => s.state === 'not_configured').length,
    error: systems.filter((s) => s.state === 'error').length,
    selfServiceConnected: systems.filter((s) => s.state === 'connected' && s.selfService).length,
  };
}

const SNAPSHOT_KEY = 'systems:lastProbe';

type Snapshot = { at: string; connected: string[] };

function readSnapshot(): Snapshot | null {
  const db = getDb();
  try {
    const raw = db.jarvis.settings.get(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (!parsed.at || !Array.isArray(parsed.connected)) return null;
    return { at: parsed.at, connected: parsed.connected.filter((x): x is string => typeof x === 'string') };
  } catch {
    return null;
  }
}

function writeSnapshot(systems: SystemStatus[]): string {
  const at = new Date().toISOString();
  const snapshot: Snapshot = {
    at,
    connected: systems.filter((s) => s.state === 'connected').map((s) => s.id),
  };
  const db = getDb();
  db.jarvis.settings.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return at;
}

/** Live status for every system, without changing the saved snapshot. */
export async function listSystems(): Promise<SystemsReport> {
  const previous = readSnapshot();
  const systems = decorate(await allConnectorStatuses());
  const connected = new Set(systems.filter((s) => s.state === 'connected').map((s) => s.id));
  return {
    systems,
    counts: count(systems),
    lastProbeAt: previous?.at ?? null,
    newlyConnected: previous ? [...connected].filter((id) => !previous.connected.includes(id)) : [],
    lost: previous ? previous.connected.filter((id) => !connected.has(id)) : [],
    needsKeys: systems
      .filter((s) => s.state !== 'connected' && !s.selfService)
      .map((s) => s.id),
  };
}

/**
 * The real "connect all" operation. Every connector is probed again; a system
 * that was already keyed and reachable comes back connected, a keyless source
 * connects if the public API answers, and everything else reports exactly
 * which credential or local install is missing.
 */
export async function probeAllSystems(): Promise<SystemsReport> {
  const previous = readSnapshot();
  const systems = decorate(await allConnectorStatuses());
  const at = writeSnapshot(systems);
  const connected = new Set(systems.filter((s) => s.state === 'connected').map((s) => s.id));
  return {
    systems,
    counts: count(systems),
    lastProbeAt: at,
    newlyConnected: previous ? [...connected].filter((id) => !previous.connected.includes(id)) : [],
    lost: previous ? previous.connected.filter((id) => !connected.has(id)) : [],
    needsKeys: systems
      .filter((s) => s.state !== 'connected' && !s.selfService)
      .map((s) => s.id),
  };
}

/** Probe one system without probing the whole board. */
export async function probeSystem(id: string): Promise<SystemStatus | null> {
  const status = await connectorStatusById(id);
  if (!status) return null;
  return decorate([status])[0] ?? null;
}
