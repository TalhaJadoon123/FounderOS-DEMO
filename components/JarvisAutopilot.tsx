/**
 * JarvisAutopilot — client component for the three real autonomy modes and the
 * persisted kill switch.
 *
 * The server owns the truth; this component applies the response it gets back
 * instead of guessing, and shows the error when a write fails.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ToggleRight, ToggleLeft } from 'lucide-react';
import { PILL } from '@/components/slab';

type AutopilotState = {
  enabled: boolean;
  autonomy: string;
  killSwitch: boolean;
  killSwitchEnv?: boolean;
  note?: string;
};

type Props = {
  initial: AutopilotState;
};

const MODES: Array<{ id: string; label: string; detail: string }> = [
  { id: 'observe', label: 'Observe', detail: 'Watches and records. Runs nothing, proposes nothing.' },
  { id: 'assisted', label: 'Assisted', detail: 'Watches, verifies, and queues real actions for your yes.' },
  { id: 'autopilot', label: 'Autopilot', detail: 'Acts on low-risk items. Money and high-risk still wait for you.' },
];

async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export function JarvisAutopilot({ initial }: Props) {
  const router = useRouter();
  const [state, setState] = useState<AutopilotState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = MODES.find((m) => m.id === state.autonomy) ?? MODES[1];

  async function update(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const next = (await fetchJson('/api/jarvis/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })) as AutopilotState;
      setState(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            {state.killSwitch ? (
              <ToggleLeft size={20} className="text-os-err" />
            ) : state.autonomy === 'autopilot' ? (
              <ToggleRight size={20} className="text-os-ok" />
            ) : (
              <ToggleRight size={20} className="text-os-muted" />
            )}
            <span className="font-semibold text-os-text">
              {state.killSwitch ? 'Paused by kill switch' : `Autonomy: ${mode.label}`}
            </span>
          </div>
          <div className="max-w-[540px] font-mono text-[12px] text-os-dim">{mode.detail}</div>
          {state.killSwitchEnv ? (
            <div className="mt-2 font-mono text-[11px] text-os-err">
              JARVIS_KILL_SWITCH=1 is set in the environment; clear it there to resume.
            </div>
          ) : null}
          {error ? <div className="mt-2 font-mono text-[11px] text-os-err">{error}</div> : null}
          {state.note ? <div className="mt-2 font-mono text-[11px] text-os-dim">{state.note}</div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={saving}
              onClick={() => update({ autonomy: m.id })}
              className={`${PILL} ${state.autonomy === m.id ? 'border-os-accent text-os-accent' : ''}`}
              aria-pressed={state.autonomy === m.id}
            >
              {m.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => update({ killSwitch: state.killSwitch ? 'off' : 'on' })}
            disabled={saving}
            className={PILL}
          >
            {saving ? (
              <RefreshCw size={13} className="animate-[om-spin_.8s_linear_infinite]" />
            ) : state.killSwitch ? (
              'Clear kill switch'
            ) : (
              'Kill switch'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
