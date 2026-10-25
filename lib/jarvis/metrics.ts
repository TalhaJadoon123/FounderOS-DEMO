/**
 * Jarvis metrics — revenue and health rollups for the dashboard.
 *
 * Reads from the DB only. Pure, testable, no network.
 */

import { getDb } from '@/lib/data';
import type { JarvisProject, JarvisAction, JarvisRevenue } from '@/lib/schemas';
import type { JarvisRun } from '@/lib/schemas';

export type JarvisMetrics = {
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
  topProjects: Array<{
    id: string;
    name: string;
    health: string;
    status: string;
    autonomy: string;
    revenueCents: number;
    sales: number;
  }>;
  recentActions: Array<{
    id: string;
    projectId: string;
    kind: string;
    risk: string;
    status: string;
    createdAt: string;
    title: string;
  }>;
  recentRevenue: Array<{
    id: string;
    projectId: string;
    source: string;
    customer: string;
    amountCents: number;
    currency: string;
    occurredAt: string;
  }>;
};

export function computeMetrics(): JarvisMetrics {
  const db = getDb();
  const projects = db.jarvis.projects.all();
  // Collect every run across all projects.
  const allRuns: JarvisRun[] = [];
  for (const p of projects) {
    allRuns.push(...db.jarvis.runs.byProject(p.id));
  }
  const actions = db.jarvis.actions.pending();
  const revenue = db.jarvis.revenue.all();

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const live = projects.filter((p: JarvisProject) => p.status === 'live').length;
  const healthGreen = projects.filter((p: JarvisProject) => p.health === 'green').length;
  const healthRed = projects.filter((p: JarvisProject) => p.health === 'red').length;
  const autopilot = projects.filter((p: JarvisProject) => p.autonomy === 'autopilot').length;
  const assisted = projects.filter((p: JarvisProject) => p.autonomy === 'assisted').length;
  const pendingApprovals = actions.length;

  const totalRevenueCents = revenue.reduce((s: number, r: JarvisRevenue) => s + r.amountCents, 0);
  const revenueThisMonthCents = revenue
    .filter((r: JarvisRevenue) => new Date(r.occurredAt) >= monthStart)
    .reduce((s: number, r: JarvisRevenue) => s + r.amountCents, 0);

  const runsToday = allRuns.filter((r: JarvisRun) => new Date(r.startedAt) >= todayStart).length;
  const runsFailedToday = allRuns.filter(
    (r: JarvisRun) => new Date(r.startedAt) >= todayStart && r.status === 'failed',
  ).length;

  const lastRunAt =
    allRuns.length > 0
      ? allRuns.reduce((a: JarvisRun, b: JarvisRun) =>
          new Date(b.startedAt) > new Date(a.startedAt) ? b : a,
        ).startedAt
      : null;

  const projectRevenue = new Map<string, { cents: number; sales: number }>();
  for (const r of revenue) {
    const cur = projectRevenue.get(r.projectId) ?? { cents: 0, sales: 0 };
    cur.cents += r.amountCents;
    cur.sales += 1;
    projectRevenue.set(r.projectId, cur);
  }

  const topProjects = projects
    .map((p: JarvisProject) => {
      const rev = projectRevenue.get(p.id) ?? { cents: 0, sales: 0 };
      return {
        id: p.id,
        name: p.name,
        health: p.health,
        status: p.status,
        autonomy: p.autonomy,
        revenueCents: rev.cents,
        sales: rev.sales,
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  const recentActions = actions
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((a: JarvisAction) => ({
      id: a.id,
      projectId: a.projectId,
      kind: a.kind,
      risk: a.risk,
      status: a.status,
      createdAt: a.createdAt,
      title: a.title,
    }));

  const recentRevenue = revenue
    .slice()
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 10)
    .map((r: JarvisRevenue) => ({
      id: r.id,
      projectId: r.projectId,
      source: r.source,
      customer: r.customer,
      amountCents: r.amountCents,
      currency: r.currency,
      occurredAt: r.occurredAt,
    }));

  return {
    projects: projects.length,
    live,
    healthGreen,
    healthRed,
    autopilot,
    assisted,
    pendingApprovals,
    totalRevenueCents,
    revenueThisMonthCents,
    runsToday,
    runsFailedToday,
    lastRunAt,
    topProjects,
    recentActions,
    recentRevenue,
  };
}
