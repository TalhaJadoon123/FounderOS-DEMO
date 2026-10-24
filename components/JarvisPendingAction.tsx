/**
 * JarvisPendingAction — approve or reject one real queued action.
 *
 * It reads the action from the API so the operator sees the actual title,
 * risk and kind, then executes through the same decide route the CLI uses.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Play, X } from 'lucide-react';
import { PILL } from '@/components/slab';

type Action = {
  id: string;
  kind: string;
  title: string;
  risk: string;
  status: string;
  payload?: Record<string, unknown>;
};

type Props = {
  approveId: string;
};

async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export function JarvisPendingAction({ approveId }: Props) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchJson('/api/jarvis/actions')
      .then((body) => {
        if (!alive) return;
        const found = (body.actions as Action[] | undefined)?.find((a) => a.id === approveId);
        setAction(found ?? null);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [approveId]);

  async function decide(decision: 'approve' | 'reject') {
    setDeciding(true);
    setError(null);
    try {
      await fetchJson(`/api/jarvis/actions/${encodeURIComponent(approveId)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      router.push('/jarvis/settings');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div className="bg-os-accent-soft border border-os-accent/30 rounded-[8px] p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Bot size={14} strokeWidth={1.7} className="text-os-accent" />
        <span className="font-mono text-[12px] text-os-accent">Pending Jarvis action</span>
      </div>
      {action ? (
        <>
          <div className="font-semibold text-[14px] text-os-text">{action.title}</div>
          <div className="mt-1 font-mono text-[11.5px] text-os-dim">
            {action.kind} · {action.risk} risk · {action.status}
          </div>
          {action.payload ? (
            <pre className="mt-3 max-h-40 overflow-auto rounded-[6px] border border-os-border bg-os-surface p-2 font-mono text-[10.5px] text-os-dim">
              {JSON.stringify(action.payload, null, 2)}
            </pre>
          ) : null}
        </>
      ) : (
        <div className="font-mono text-[12px] text-os-text">
          {error ? `Could not load action: ${error}` : `Loading action ${approveId}…`}
        </div>
      )}
      <div className="flex gap-3 mt-3">
        <button
          type="button"
          disabled={deciding || !action}
          onClick={() => decide('approve')}
          className="pressable inline-flex items-center gap-1.5 rounded-full border border-os-accent bg-os-accent px-4 py-2 text-[12px] text-os-ink hover:bg-white disabled:opacity-50"
        >
          <Play size={12} strokeWidth={1.7} /> {deciding ? 'Working…' : 'Approve & execute'}
        </button>
        <button
          type="button"
          disabled={deciding || !action}
          onClick={() => decide('reject')}
          className={PILL}
        >
          <X size={12} strokeWidth={1.7} /> Reject
        </button>
      </div>
      {error && action ? <div className="mt-2 font-mono text-[11px] text-os-err">{error}</div> : null}
    </div>
  );
}
