import type { FounderDb } from '@/lib/db';
import type {
  Agent,
  AgentCron,
  Department,
  Proposal,
} from '@/lib/schemas';

/**
 * Minimal runtime seed — only the structural data the OS needs to function.
 * NO demo content, NO fake metrics, NO seeded social/email/funnel/trading data.
 *
 * All other tables start EMPTY. Pages show honest "not configured" or empty states
 * until real data arrives via connectors, webhooks, or operator input.
 */

// The six operating pillars — static, never demo data.
const departments: Department[] = [
  { id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'Pipeline and deals.', color: '#fafafa', order: 1 },
  { id: 'dept-marketing-growth', name: 'Marketing/Growth', slug: 'marketing-growth', tagline: 'Publishing, content, attention.', color: '#d4d4d4', order: 2 },
  { id: 'dept-tech', name: 'TECH', slug: 'tech', tagline: 'AI & automations · G-Brain.', color: '#a3a3a3', order: 3 },
  { id: 'dept-finance', name: 'Finances', slug: 'finances', tagline: 'Every processor, one view.', color: '#737373', order: 4 },
  { id: 'dept-comms', name: 'Communications', slug: 'communications', tagline: 'Gmail, WhatsApp, Slack → one feed.', color: '#525252', order: 5 },
  { id: 'dept-clients', name: 'Clients', slug: 'clients', tagline: 'Every client, onboarded and served.', color: '#d4d4d4', order: 6 },
];

// The agent roster IS the runtime — 1:1 mapping to RuntimeAgent in lib/agents/real.ts
// No demo agents. Each row here becomes a live instance slot.
const agents: Agent[] = [
  // ── TECH: AI head ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'conductor',
    departmentId: 'dept-tech',
    name: 'Conductor',
    role: 'Broadcast & Orchestration',
    status: 'active',
    tier: 'lead',
    description: 'Fans your message out to every agent at once and checks which instance hosts (Clawline, Ollama, tmux) are available for future bindings.',
    model: 'fan-out runtime',
    tools: ['broadcast', 'clawline', 'tmux'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Communications: one instance, three channel workers feeding /comms ────────
  {
    id: 'comms-digest',
    departmentId: 'dept-comms',
    name: 'Comms Digest',
    role: 'Morning Report · 09:00 daily',
    status: 'active',
    tier: 'lead',
    description: 'Scrapes the last 24h across all four inboxes, WhatsApp and Slack and ranks who needs a reply: calls first, then clients, community members, brand deals, group chats, companies last. Also lists what to unsubscribe from.',
    model: 'rules + connectors',
    tools: ['comms-feed', 'calendar', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'comms-agent',
    departmentId: 'dept-comms',
    name: 'Comms Agent',
    role: 'Unified Communications Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns the unified /comms feed. Aggregates its three channel workers and reports which are live.',
    model: 'rules + connectors',
    tools: ['comms-feed', 'calendar', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'email-agent',
    departmentId: 'dept-comms',
    name: 'Email Agent',
    role: 'Gmail / IMAP Worker',
    status: 'active',
    tier: 'worker',
    description: 'Fetches new mail from configured inboxes, classifies threads, and surfaces action items. Requires IMAP credentials.',
    model: 'IMAP',
    tools: ['imap', 'ledger'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  {
    id: 'whatsapp-agent',
    departmentId: 'dept-comms',
    name: 'WhatsApp Agent',
    role: 'WhatsApp Worker',
    status: 'active',
    tier: 'worker',
    description: 'Receives inbound WhatsApp via webhook, classifies, and routes to the feed. Requires WhatsApp Business API.',
    model: 'WhatsApp',
    tools: ['whatsapp-webhook', 'ledger'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  {
    id: 'slack-agent',
    departmentId: 'dept-comms',
    name: 'Slack Agent',
    role: 'Slack Worker',
    status: 'active',
    tier: 'worker',
    description: 'Listens to Slack channels via Events API, extracts DMs and mentions. Requires SLACK_BOT_TOKEN.',
    model: 'Slack',
    tools: ['slack-events', 'ledger'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  // ── Sales: funnel agents ─────────────────────────────────────────────────────
  {
    id: 'client-onboarding',
    departmentId: 'dept-sales',
    name: 'Client Onboarding',
    role: 'SOP Runner · Triggered by funnel',
    status: 'active',
    tier: 'lead',
    description: 'When a deal closes, provisions the Ledger trigger, Slack workspace, and onboarding checklist.',
    model: 'SOP executor',
    tools: ['sop-runner', 'slack', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'crm-pulse',
    departmentId: 'dept-sales',
    name: 'CRM Pulse',
    role: 'Pipeline Sync · Weekdays 09:00',
    status: 'active',
    tier: 'lead',
    description: 'Pulls pipeline from Attio/GHL, computes stage ages, and flags stalled deals. Requires GHL_API_KEY or Attio key.',
    model: 'Attio / GHL',
    tools: ['attio', 'ghl', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'brand-deal-agent',
    departmentId: 'dept-sales',
    name: 'Brand Deal Agent',
    role: 'Sponsorship Pipeline',
    status: 'active',
    tier: 'lead',
    description: 'Tracks inbound sponsorship requests, scores ICPs, and manages the deal board. Real data only — no seed.',
    model: 'rules + connectors',
    tools: ['brand-deals', 'ledger', 'attio'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Marketing/Growth: content & social ───────────────────────────────────────
  {
    id: 'social-agent',
    departmentId: 'dept-marketing-growth',
    name: 'Social Agent',
    role: 'Postly + Adsmith · 18:00 daily',
    status: 'active',
    tier: 'lead',
    description: 'Generates posts from approved topics, creates ad variants, and schedules via Postly. Requires Postly/API keys.',
    model: 'Postly + Adsmith',
    tools: ['postly', 'adsmith', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'content-agent',
    departmentId: 'dept-marketing-growth',
    name: 'Content Agent',
    role: 'Calendar & Pipeline',
    status: 'active',
    tier: 'lead',
    description: 'Manages the editorial calendar, assigns briefs, and tracks publishing status. Empty until you add content.',
    model: 'rules + connectors',
    tools: ['content-calendar', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Finance: revenue & trading ───────────────────────────────────────────────
  {
    id: 'finance-agent',
    departmentId: 'dept-finance',
    name: 'Finance Agent',
    role: 'Revenue Sync & Ledger',
    status: 'active',
    tier: 'lead',
    description: 'Syncs Stripe/Wise/NOWPayments revenue, writes trade P&L from bot-sync, and maintains the funding ledger. Keys required for live data.',
    model: 'Stripe / Wise / NOWPayments / MT5',
    tools: ['stripe', 'wise', 'nowpayments', 'bot-sync', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Clients: ops agents ──────────────────────────────────────────────────────
  {
    id: 'ops-agent',
    departmentId: 'dept-clients',
    name: 'Ops Agent',
    role: 'Deliverables & Tasks',
    status: 'active',
    tier: 'lead',
    description: 'Tracks deliverable decisions, runs the task board, and enforces SOP checklists. Empty until work is assigned.',
    model: 'rules + connectors',
    tools: ['deliverables', 'tasks', 'sops', 'ledger'],
    parentId: null,
    instance: 'builtin',
  },
];

// Scheduled jobs that ship with the OS — each maps to an agent that genuinely does the work.
export const seededCrons: AgentCron[] = [
  {
    id: 'cron-comms-digest-0900',
    agentId: 'comms-digest',
    schedule: '0 9 * * *',
    description: 'Morning comms report: 24h of email, WhatsApp and Slack, ranked by who needs a reply',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-plaud-ingest-30m',
    agentId: 'sales-calls-data',
    schedule: '*/30 * * * *',
    description: 'File every newly transcribed Plaud recording into G-Brain (summary + transcript) and its action items into the claim store; no LLM, pure code',
    enabled: true,
    createdAt: '2026-08-26T00:00:00.000Z',
  },
  {
    id: 'cron-client-onboarding-0830',
    agentId: 'client-onboarding',
    schedule: '30 8 * * *',
    description: 'Onboarding SOP readiness: the Ledger trigger and the Slack workspace it provisions',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-crm-pulse-0900',
    agentId: 'crm-pulse',
    schedule: '0 9 * * 1-5',
    description: 'Ledger deals pipeline across Vantage and Launchpad Cohort',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
  {
    id: 'cron-social-agent-1800',
    agentId: 'social-agent',
    schedule: '0 18 * * *',
    description: 'Postly publishing and Adsmith ad generation, checked before the evening',
    enabled: true,
    createdAt: '2026-08-18T00:00:00.000Z',
  },
];

/**
 * Bump this whenever the seed's CONTENT changes in a way production must see.
 *
 * getDb() otherwise only seeds when a table is empty, so on a long-lived
 * install the seed would never re-run. The stamp forces exactly one re-seed per change.
 */
export const SEED_VERSION = '2026-10-25-no-demo-data';

export function seedDatabase(db: FounderDb): void {
  // INSERT OR REPLACE makes re-seeding idempotent by id.
  for (const c of seededCrons) db.agentCrons.insert(c);
  for (const d of departments) db.departments.insert(d);
  for (const a of agents) db.agents.insert(a);

  // The roster IS the runtime: rows that left the roster leave the DB too.
  db.agents.deleteWhereIdNotIn(agents.map((a) => a.id));
  db.departments.deleteWhereIdNotIn(departments.map((d) => d.id));

  // ALL OTHER TABLES START EMPTY — no seeded demo data.
  // Pages show honest "not configured" or empty states until real data arrives.
}

/**
 * Empty by design — the OS ships no seeded proposals. Create them from the OS.
 * This export exists so existing tests and syncSeededProposals continue to compile.
 */
export const SEEDED_PROPOSALS: Proposal[] = [];

export function syncSeededProposals(db: FounderDb): void {
  // Proposals table is empty by design — create them from the OS.
  // But we still prune stale seed-origin rows so removed seeds don't linger.
  for (const p of SEEDED_PROPOSALS) db.proposals.insert(p);
  db.proposals.deleteSeededNotIn(SEEDED_PROPOSALS.map((p) => p.id));
}