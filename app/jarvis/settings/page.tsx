/**
 * Jarvis settings page — server component.
 *
 * Reads the real project list and autonomy state, then hands interactivity to
 * client components. `?edit=` and `?approve=` are read from the server's
 * searchParams (not `window`, which never exists in a server component).
 */

import Link from 'next/link';
import { SlabCard, Chip, PILL } from '@/components/slab';
import { JarvisAutopilot } from '@/components/JarvisAutopilot';
import { JarvisProjectEditor } from '@/components/JarvisProjectEditor';
import { JarvisPendingAction } from '@/components/JarvisPendingAction';
import { JarvisRunButton } from '@/components/JarvisRunButton';

export const dynamic = 'force-dynamic';

type AutopilotState = {
  enabled: boolean;
  autonomy: string;
  killSwitch: boolean;
  killSwitchEnv?: boolean;
  note?: string;
};

type SearchParams = {
  approve?: string | string[];
  edit?: string | string[];
};

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

async function fetchJson(path: string): Promise<any> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function JarvisSettingsPage({ searchParams }: { searchParams?: SearchParams }) {
  const [pj, ap] = await Promise.all([
    fetchJson('/api/jarvis/projects'),
    fetchJson('/api/jarvis/autopilot'),
  ]);

  const projects = pj?.projects ?? [];
  const autopilot: AutopilotState = {
    enabled: !!ap?.enabled,
    autonomy: ap?.autonomy ?? 'assisted',
    killSwitch: !!ap?.killSwitch,
    killSwitchEnv: !!ap?.killSwitchEnv,
    note: ap?.note,
  };

  const approveId = one(searchParams?.approve);
  const editId = one(searchParams?.edit);

  const usd = (cents: number) => (cents / 100).toFixed(2);

  return (
    <div className="max-w-5xl mx-auto p-6">
      {approveId ? (
        <JarvisPendingAction approveId={approveId} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-os-dim">jarvis — controls</div>
              <h1 className="mt-1 text-[24px] font-semibold text-os-text">Settings</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <JarvisRunButton />
              <Link href="/jarvis/systems" className={PILL}>
                Systems
              </Link>
              <Link href="/jarvis" className={PILL}>
                Dashboard
              </Link>
              <Link href="/jarvis/settings" className={PILL}>
                Refresh
              </Link>
            </div>
          </div>

          <SlabCard title="Autopilot" i={0} className="mb-6">
            <JarvisAutopilot initial={autopilot} />
          </SlabCard>

          <SlabCard title="Projects under management" i={1}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[19px] font-semibold">Connected projects</h2>
              <span className="font-mono text-[11px] text-os-dim">{projects.length} project(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-os-border text-os-dim">
                    <th className="pb-3 font-mono">Name</th>
                    <th className="pb-3 font-mono">Repo / branch</th>
                    <th className="pb-3 font-mono">Deploy URL</th>
                    <th className="pb-3 font-mono text-right">Price</th>
                    <th className="pb-3 font-mono">Status</th>
                    <th className="pb-3 font-mono">Autonomy</th>
                    <th className="pb-3 font-mono text-right">Health</th>
                    <th className="pb-3 font-mono text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-os-dim">
                        No projects yet. Add your first project below — Jarvis will watch it, verify it, ship it, announce it, and sell it.
                      </td>
                    </tr>
                  ) : (
                    projects.map((p: any) => (
                      <tr key={p.id} className="border-b border-os-border/50 group">
                        <td className="py-4 font-mono">{p.name}</td>
                        <td className="py-4 font-mono">{p.repo || '—'} / {p.branch}</td>
                        <td className="py-4 font-mono">{p.deployUrl || '—'}</td>
                        <td className="py-4 font-mono tabular-nums text-right">${usd(p.priceCents)} {p.currency}</td>
                        <td className="py-4 font-mono">
                          <Chip tone={p.status === 'live' ? 'ok' : 'warn'}>{p.status}</Chip>
                        </td>
                        <td className="py-4 font-mono">
                          <Chip tone={p.autonomy === 'autopilot' ? 'ok' : p.autonomy === 'observe' ? 'warn' : 'ok'}>{p.autonomy}</Chip>
                        </td>
                        <td className="py-4 font-mono text-right">
                          <Chip tone={p.health === 'green' ? 'ok' : p.health === 'red' ? 'err' : 'warn'}>{p.health}</Chip>
                        </td>
                        <td className="py-4 font-mono text-right">
                          <Link
                            href={`/jarvis/settings?edit=${encodeURIComponent(p.id)}`}
                            className="pressable inline-flex items-center gap-1 rounded-full border border-os-border px-3 py-1.5 text-[11.5px] text-os-accent hover:bg-os-accent-soft"
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SlabCard>

          <SlabCard title="Add or edit a project" i={2}>
            <JarvisProjectEditor initialProjects={projects} editingId={editId} />
          </SlabCard>
        </>
      )}
      <div className="mt-8 border-t border-os-border pt-6 font-mono text-[11px] text-os-dim">
        Jarvis never stores your API keys. Deploy hooks, Stripe keys, Slack tokens and Resend keys
        live in your .env.local (never committed). Jarvis reads them at run time.
      </div>
    </div>
  );
}
