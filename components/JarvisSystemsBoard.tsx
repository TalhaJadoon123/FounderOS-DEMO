'use client';

/**
 * The live systems board.
 *
 * Every state on this screen comes from a connector probe that just ran. The
 * "Connect all" button re-probes all of them and reports exactly what came
 * online and what still needs a key or a local install. It never sets a row
 * to connected on its own.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ExternalLink, CheckCircle2, AlertTriangle, CircleDashed } from 'lucide-react';
import { SlabCard, Chip, PILL } from '@/components/slab';
import type { SystemStatus, SystemsReport } from '@/lib/jarvis/systems';

type Filter = 'all' | 'connected' | 'needs' | 'error';

const STATE_TONE: Record<string, 'ok' | 'warn' | 'err'> = {
  connected: 'ok',
  not_configured: 'warn',
  error: 'err',
};

function StateChip({ state }: { state: string }) {
  const tone = STATE_TONE[state] ?? 'warn';
  const label = state === 'not_configured' ? 'not configured' : state;
  return <Chip tone={tone}>{label}</Chip>;
}

export function JarvisSystemsBoard({ initial }: { initial: SystemsReport }) {
  const router = useRouter();
  const [report, setReport] = useState<SystemsReport>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'connected') return report.systems.filter((s) => s.state === 'connected');
    if (filter === 'needs') return report.systems.filter((s) => s.state !== 'connected' && s.state !== 'error');
    if (filter === 'error') return report.systems.filter((s) => s.state === 'error');
    return report.systems;
  }, [report.systems, filter]);

  async function probeAll() {
    setBusy('all');
    setError(null);
    try {
      const res = await fetch('/api/jarvis/systems', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as SystemsReport & { error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setReport(body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function probeOne(system: SystemStatus) {
    setBusy(system.id);
    setError(null);
    try {
      const res = await fetch(`/api/jarvis/systems/${encodeURIComponent(system.id)}`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { system?: SystemStatus; error?: string };
      if (!res.ok || !body.system) throw new Error(body.error || `HTTP ${res.status}`);
      setReport((prev) => {
        const systems = prev.systems.map((s) => (s.id === body.system!.id ? body.system! : s));
        return {
          ...prev,
          systems,
          counts: {
            total: systems.length,
            connected: systems.filter((s) => s.state === 'connected').length,
            notConfigured: systems.filter((s) => s.state === 'not_configured').length,
            error: systems.filter((s) => s.state === 'error').length,
            selfServiceConnected: systems.filter((s) => s.state === 'connected' && s.selfService).length,
          },
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const { counts } = report;

  return (
    <div className="space-y-6">
      <SlabCard title="Connection summary" i={0}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[8px] border border-os-border bg-os-surface p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim">Connected</div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums text-os-ok">{counts.connected}</div>
            <div className="font-mono text-[10.5px] text-os-dim">of {counts.total} systems</div>
          </div>
          <div className="rounded-[8px] border border-os-border bg-os-surface p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim">Needs a key</div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums text-os-warn">{counts.notConfigured}</div>
            <div className="font-mono text-[10.5px] text-os-dim">paste it in Integrations</div>
          </div>
          <div className="rounded-[8px] border border-os-border bg-os-surface p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim">Probe errors</div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums text-os-err">{counts.error}</div>
            <div className="font-mono text-[10.5px] text-os-dim">provider rejected the check</div>
          </div>
          <div className="rounded-[8px] border border-os-border bg-os-surface p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim">Keyless live</div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums text-os-accent">{counts.selfServiceConnected}</div>
            <div className="font-mono text-[10.5px] text-os-dim">no credential needed</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={probeAll} disabled={busy !== null} className={PILL}>
            <RefreshCw size={13} strokeWidth={1.7} className={busy === 'all' ? 'animate-[om-spin_.8s_linear_infinite]' : ''} />
            {busy === 'all' ? 'Probing all systems…' : 'Connect all (live probe)'}
          </button>
          <span className="font-mono text-[10.5px] text-os-dim">
            {report.lastProbeAt
              ? `Last saved probe ${new Date(report.lastProbeAt).toLocaleString()}`
              : 'No saved probe yet'}
          </span>
        </div>

        {report.newlyConnected.length > 0 ? (
          <div className="mt-3 rounded-[8px] border border-os-ok/30 bg-os-ok/10 p-3 font-mono text-[11.5px] text-os-ok">
            <CheckCircle2 size={12} className="mr-1 inline" /> Came online since the last probe:{' '}
            {report.newlyConnected.join(', ')}
          </div>
        ) : null}
        {report.lost.length > 0 ? (
          <div className="mt-3 rounded-[8px] border border-os-err/30 bg-os-err/10 p-3 font-mono text-[11.5px] text-os-err">
            <AlertTriangle size={12} className="mr-1 inline" /> Went offline since the last probe:{' '}
            {report.lost.join(', ')}
          </div>
        ) : null}
        {error ? <div className="mt-3 font-mono text-[11.5px] text-os-err">{error}</div> : null}
      </SlabCard>

      <SlabCard title="Every system" i={1}>
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ['all', `All ${counts.total}`],
              ['connected', `Connected ${counts.connected}`],
              ['needs', `Needs setup ${counts.notConfigured}`],
              ['error', `Errors ${counts.error}`],
            ] as Array<[Filter, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`${PILL} ${filter === id ? 'border-os-accent text-os-accent' : ''}`}
              aria-pressed={filter === id}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.map((system) => (
            <div
              key={system.id}
              className="rounded-[8px] border border-os-border bg-os-surface p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[13px] text-os-text">{system.name}</span>
                    <StateChip state={system.state} />
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim">{system.kind}</span>
                    {system.selfService ? (
                      <span className="font-mono text-[10px] text-os-accent">keyless</span>
                    ) : null}
                  </div>
                  <div className="mt-1 break-words font-mono text-[11px] text-os-dim">{system.detail}</div>
                  {system.state !== 'connected' && system.needs.length > 0 ? (
                    <div className="mt-1 font-mono text-[10.5px] text-os-warn">
                      Needs: {system.needs.join(' · ')}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => probeOne(system)}
                    disabled={busy !== null}
                    className={PILL}
                  >
                    <RefreshCw
                      size={11}
                      strokeWidth={1.7}
                      className={busy === system.id ? 'animate-[om-spin_.8s_linear_infinite]' : ''}
                    />
                    Test
                  </button>
                  {system.slug ? (
                    <a href={`/integrations#${system.slug}`} className={PILL}>
                      <ExternalLink size={11} strokeWidth={1.7} /> Connect
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-os-dim">
                      <CircleDashed size={11} /> env keys
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="py-8 text-center font-mono text-[12px] text-os-dim">No systems in this filter.</div>
          ) : null}
        </div>
      </SlabCard>

      <div className="font-mono text-[10.5px] leading-relaxed text-os-dim">
        A green row means the provider answered this probe. Nothing here is seeded, cached green, or
        marked connected because a key name exists. Keyed systems connect the moment you save a real
        credential on the Integrations page; the next probe picks it up without a restart.
      </div>
    </div>
  );
}
