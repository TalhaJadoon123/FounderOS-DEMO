'use client';

/**
 * The real trigger buttons for Jarvis.
 *
 * "Run Jarvis now" POSTs the same route a cron would; "Sync revenue" pulls
 * completed Stripe sessions into the local ledger. Both report the server's
 * actual result instead of optimistically flipping a label.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, RefreshCw } from 'lucide-react';
import { PILL } from '@/components/slab';

type RunResult = {
  results?: Array<{ name: string; status: string; summary: string }>;
  paused?: boolean;
  reason?: string;
  error?: string;
};

type SyncResult = {
  ok?: boolean;
  synced?: number;
  summary?: string;
  error?: string;
};

export function JarvisRunButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/jarvis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual' }),
      });
      const body = (await res.json().catch(() => ({}))) as RunResult;
      if (!res.ok) {
        setMessage(body.error || `Run failed (HTTP ${res.status})`);
      } else if (body.paused) {
        setMessage(`Paused: ${body.reason ?? 'kill switch is on'}`);
      } else if (body.results?.length) {
        const needs = body.results.filter((r) => r.status !== 'ok').length;
        setMessage(
          needs > 0
            ? `${body.results.length} project(s) ran — ${needs} need you.`
            : `${body.results.length} project(s) ran clean.`,
        );
      } else {
        setMessage('No projects to run. Add one in Settings.');
      }
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={run} disabled={busy} className={PILL} aria-busy={busy}>
        <Play size={13} strokeWidth={1.7} /> {busy ? 'Running…' : 'Run Jarvis now'}
      </button>
      {message ? <span className="max-w-[260px] text-[10.5px] leading-tight text-os-dim">{message}</span> : null}
    </span>
  );
}

export function JarvisSyncRevenueButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/jarvis/revenue/sync', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as SyncResult;
      if (!res.ok) {
        setMessage(body.error || `Sync failed (HTTP ${res.status})`);
      } else {
        setMessage(body.summary ?? `Synced ${body.synced ?? 0} payment(s).`);
      }
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={sync} disabled={busy} className={PILL} aria-busy={busy}>
        <RefreshCw size={13} strokeWidth={1.7} /> {busy ? 'Syncing…' : 'Sync Stripe'}
      </button>
      {message ? <span className="max-w-[260px] text-[10.5px] leading-tight text-os-dim">{message}</span> : null}
    </span>
  );
}
