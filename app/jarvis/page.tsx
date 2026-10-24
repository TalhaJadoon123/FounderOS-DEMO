/**
 * Jarvis dashboard — the command center for your autonomous team.
 *
 * Shows metrics, per-project health, pending approvals, and a one-button
 * "run Jarvis now" trigger. Built on the same Slab kit as the rest of the OS.
 */

import { Settings, PlugZap } from 'lucide-react';

import { Slab, SlabTitle, SlabCard, BigStat, Chip, MeterStack, PILL } from '@/components/slab';
import { JarvisRunButton, JarvisSyncRevenueButton } from '@/components/JarvisRunButton';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type ProjectRow = {
  id: string;
  name: string;
  health: string;
  status: string;
  autonomy: string;
  revenueCents: number;
  sales: number;
};

type ActionRow = {
  id: string;
  projectId: string;
  kind: string;
  risk: string;
  status: string;
  createdAt: string;
  title: string;
};

type RevenueRow = {
  id: string;
  projectId: string;
  source: string;
  customer: string;
  amountCents: number;
  currency: string;
  occurredAt: string;
};

type Metrics = {
  projects: number;
  live: number;
  healthGreen: number;
  healthRed: number;
  autopilot: number;
  assisted: number;
  pendingApprovals: number;
  totalRevenueCents: number;
  revenueThisMonthCents: number;
  runsToday: number;
  runsFailedToday: number;
  lastRunAt: string | null;
  topProjects: ProjectRow[];
  recentActions: ActionRow[];
  recentRevenue: RevenueRow[];
};

async function fetchJson(path: string): Promise<any> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    // No server in test/dev; render with empty metrics rather than throwing.
    return null;
  }
}

const EMPTY_METRICS: Metrics = {
  projects: 0,
  live: 0,
  healthGreen: 0,
  healthRed: 0,
  autopilot: 0,
  assisted: 0,
  pendingApprovals: 0,
  totalRevenueCents: 0,
  revenueThisMonthCents: 0,
  runsToday: 0,
  runsFailedToday: 0,
  lastRunAt: null,
  topProjects: [],
  recentActions: [],
  recentRevenue: [],
};

export default async function JarvisPage() {
  // The route returns { metrics }. Accept a flat body too so older builds and
  // direct callers keep working, but never render NaN because of a wrapper.
  const payload = await fetchJson('/api/jarvis/metrics');
  const metrics: Metrics = payload?.metrics ?? payload ?? EMPTY_METRICS;

  const totalUsd = (metrics.totalRevenueCents / 100).toFixed(2);
  const monthUsd = (metrics.revenueThisMonthCents / 100).toFixed(2);

  return (
    <Slab>
      <SlabTitle
        eyebrow="jarvis — autonomous team"
        title="Jarvis"
        meta={`Jarvis watches, verifies, ships, announces, sells and reports — ${metrics.projects} project(s), $${totalUsd} lifetime`}
        right={
          <>
            <JarvisRunButton />
            <JarvisSyncRevenueButton />
            <Link href="/jarvis/systems" className={PILL}>
              <PlugZap size={13} strokeWidth={1.7} /> Systems
            </Link>
            <Link href="/jarvis/settings" className={PILL}>
              <Settings size={13} strokeWidth={1.7} /> Settings
            </Link>
          </>
        }
      />

      {/* Top metrics row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <BigStat value={metrics.projects} unit="projects" caption="under management" chips={[{ text: metrics.autopilot > 0 ? `${metrics.autopilot} on autopilot` : 'none on autopilot', tone: 'ok' }]} />
        <BigStat value={metrics.live} unit="live" caption="deployments" chips={[{ text: `${metrics.healthGreen} green`, tone: 'ok' }, { text: `${metrics.healthRed} red`, tone: metrics.healthRed > 0 ? 'err' : 'ok' }]} />
        <BigStat display={`$${totalUsd}`} unit="lifetime" caption="revenue" chips={[{ text: `+$${monthUsd} this month`, tone: 'ok' }]} />
        <BigStat value={metrics.runsToday} unit="runs today" caption={metrics.runsFailedToday > 0 ? `${metrics.runsFailedToday} failed` : 'all clear'} chips={[{ text: metrics.runsFailedToday > 0 ? 'needs you' : 'healthy', tone: metrics.runsFailedToday > 0 ? 'warn' : 'ok' }]} />
        <BigStat value={metrics.pendingApprovals} unit="pending" caption="your decisions" chips={[{ text: metrics.pendingApprovals > 0 ? 'approve or reject' : 'caught up', tone: metrics.pendingApprovals > 0 ? 'warn' : 'ok' }]} />
        <BigStat display={metrics.lastRunAt ? new Date(metrics.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'never'} unit="last run" caption="Jarvis last acted" />
      </div>

      {/* Health meters */}
      <SlabCard title="Project health" i={1}>
        <MeterStack
          meters={[
            { label: 'Live', frac: metrics.projects > 0 ? metrics.live / metrics.projects : 0, display: `${metrics.live}/${metrics.projects}`, hue: '#22c55e' },
            { label: 'Healthy', frac: metrics.projects > 0 ? metrics.healthGreen / metrics.projects : 0, display: `${metrics.healthGreen}/${metrics.projects}`, hue: '#22c55e' },
            { label: 'Autopilot', frac: metrics.projects > 0 ? metrics.autopilot / metrics.projects : 0, display: `${metrics.autopilot}/${metrics.projects}`, hue: '#3b82f6' },
          ]}
          empty="No projects yet — add one in Settings."
        />
      </SlabCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top projects */}
        <SlabCard title="Your projects" i={2}>
          <div className="space-y-3">
            {metrics.topProjects.length === 0 ? (
              <div className="py-4 text-center text-[12.5px] text-os-dim">No projects yet.</div>
            ) : (
              metrics.topProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-[8px] border border-os-border bg-os-surface">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-os-text">{p.name}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Chip tone={p.health === 'green' ? 'ok' : p.health === 'red' ? 'err' : 'warn'}>{p.health}</Chip>
                      <span className="font-mono text-[11px] text-os-dim">{p.autonomy}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono tabular-nums text-os-text">$${(p.revenueCents / 100).toFixed(2)}</div>
                    <div className="text-[11px] text-os-dim">{p.sales} sale{p.sales === 1 ? '' : 's'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SlabCard>

        {/* Pending approvals */}
        <SlabCard title="Your decisions" i={3}>
          <div className="space-y-3">
            {metrics.recentActions.length === 0 ? (
              <div className="py-4 text-center text-[12.5px] text-os-dim">Nothing waiting on you.</div>
            ) : (
              metrics.recentActions.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-[8px] border border-os-border bg-os-surface">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-os-text truncate">{a.title}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Chip tone={a.risk === 'high' ? 'err' : a.risk === 'medium' ? 'warn' : 'ok'}>{a.kind}</Chip>
                      <span className="font-mono text-[11px] text-os-dim">{a.risk} risk</span>
                    </div>
                  </div>
                  <Link
                    href={`/jarvis/settings?approve=${a.id}`}
                    className="pressable inline-flex items-center gap-1 rounded-full border border-os-border px-3 py-1.5 text-[11.5px] text-os-accent hover:bg-os-accent-soft"
                  >
                    Decide
                  </Link>
                </div>
              ))
            )}
          </div>
        </SlabCard>
      </div>

      {/* Recent revenue */}
      <SlabCard title="Recent sales" i={4}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-os-border text-os-dim">
                <th className="pb-2 font-mono">Source</th>
                <th className="pb-2 font-mono text-right">Amount</th>
                <th className="pb-2 font-mono">Customer</th>
                <th className="pb-2 font-mono text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recentRevenue.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-os-dim">
                    No sales yet. Jarvis mints a checkout link when a project is live and priced.
                  </td>
                </tr>
              ) : (
                metrics.recentRevenue.map((r) => (
                  <tr key={r.id} className="border-b border-os-border/50">
                    <td className="py-3 font-mono">{r.source}</td>
                    <td className="py-3 font-mono tabular-nums text-right">$${(r.amountCents / 100).toFixed(2)}</td>
                    <td className="py-3 font-mono">{r.customer || '—'}</td>
                    <td className="py-3 font-mono text-right text-os-dim">{new Date(r.occurredAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SlabCard>

      <div className="mt-8 border-t border-os-border pt-6 font-mono text-[11px] text-os-dim">
        Jarvis stages: watch → verify → ship → announce → sell → report.{' '}
        <span className="text-os-text">Money and high-risk actions always wait for your yes.</span>
      </div>
    </Slab>
  );
}
