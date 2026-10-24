/**
 * JarvisProjectEditor — create, edit or delete a real project.
 *
 * Everything is persisted through /api/jarvis/projects; the edit target comes
 * from the server's `?edit=` param, not from `window` (which is unavailable in
 * the server render and caused the form to always start blank).
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Trash2 } from 'lucide-react';
import { PILL } from '@/components/slab';

type Project = {
  id: string;
  name: string;
  repo: string;
  branch: string;
  deployUrl: string;
  healthUrl: string;
  checkoutUrl: string;
  stripePriceId: string;
  deployHookEnv: string;
  localPath: string;
  verifyCommand: string;
  priceCents: number;
  currency: string;
  status: string;
  autonomy: string;
  health: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
};

type Props = {
  initialProjects: Project[];
  editingId?: string;
};

async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

const input =
  'w-full rounded-[6px] border border-os-border bg-os-surface px-3 py-2 font-mono text-[12px]';

export function JarvisProjectEditor({ initialProjects, editingId }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'warn' | 'err' }>({
    text: '',
    kind: 'ok',
  });

  const editing = projects.find((p) => p.id === editingId);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  async function load() {
    const pj = await fetchJson('/api/jarvis/projects');
    setProjects(pj?.projects ?? []);
  }

  async function saveProject(project: Project) {
    setSaving(true);
    setMessage({ text: '', kind: 'ok' });
    try {
      if (editing) {
        await fetchJson(`/api/jarvis/projects/${encodeURIComponent(project.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(project),
        });
      } else {
        await fetchJson('/api/jarvis/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(project),
        });
      }
      setMessage({ text: `Saved ${project.name}.`, kind: 'ok' });
      await load();
      router.push('/jarvis/settings');
      router.refresh();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Save failed.', kind: 'err' });
    } finally {
      setSaving(false);
    }
  }

  async function removeProject(project: Project) {
    if (!window.confirm(`Delete ${project.name} and its run history? This cannot be undone.`)) return;
    setSaving(true);
    setMessage({ text: '', kind: 'ok' });
    try {
      await fetchJson(`/api/jarvis/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
      setMessage({ text: `Deleted ${project.name}.`, kind: 'ok' });
      await load();
      router.push('/jarvis/settings');
      router.refresh();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Delete failed.', kind: 'err' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const project: Project = {
          id: editing?.id ?? `jarvis-project-${crypto.randomUUID()}`,
          name: form.get('name') as string,
          repo: form.get('repo') as string,
          branch: (form.get('branch') as string) || 'main',
          deployUrl: form.get('deployUrl') as string,
          healthUrl: form.get('healthUrl') as string,
          checkoutUrl: form.get('checkoutUrl') as string,
          stripePriceId: form.get('stripePriceId') as string,
          deployHookEnv: (form.get('deployHookEnv') as string) || 'VERCEL_DEPLOY_HOOK_URL',
          localPath: form.get('localPath') as string,
          verifyCommand: form.get('verifyCommand') as string,
          priceCents: Number(form.get('priceCents') || 0),
          currency: (form.get('currency') as string) || 'USD',
          status: (form.get('status') as string) || 'draft',
          autonomy: (form.get('autonomy') as string) || 'assisted',
          health: editing?.health ?? 'unknown',
          createdAt: editing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastRunAt: editing?.lastRunAt ?? null,
        };
        saveProject(project);
      }}
      className="space-y-4 p-5"
      key={editing?.id ?? 'new'}
    >
      {message.text ? (
        <div
          className={`rounded-[8px] border p-3 font-mono text-[12px] ${
            message.kind === 'ok'
              ? 'border-os-ok/30 bg-os-ok/10 text-os-ok'
              : 'border-os-err/30 bg-os-err/10 text-os-err'
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Project name</label>
          <input name="name" defaultValue={editing?.name ?? ''} className={input} required />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">GitHub repo (owner/name)</label>
          <input name="repo" defaultValue={editing?.repo ?? ''} className={input} placeholder="owner/repo" />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Branch</label>
          <input name="branch" defaultValue={editing?.branch ?? 'main'} className={input} />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Deploy URL</label>
          <input name="deployUrl" defaultValue={editing?.deployUrl ?? ''} className={input} placeholder="https://your-app.vercel.app" />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Health URL</label>
          <input name="healthUrl" defaultValue={editing?.healthUrl ?? ''} className={input} placeholder="https://your-app.vercel.app/api/health" />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Checkout URL</label>
          <input name="checkoutUrl" defaultValue={editing?.checkoutUrl ?? ''} className={input} placeholder="https://buy.stripe.com/..." />
        </div>
        <div className="lg:col-span-2">
          <label className="block font-mono text-[11px] text-os-dim mb-1">Stripe price ID (optional)</label>
          <input name="stripePriceId" defaultValue={editing?.stripePriceId ?? ''} className={input} placeholder="price_..." />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Deploy hook env var</label>
          <input name="deployHookEnv" defaultValue={editing?.deployHookEnv ?? 'VERCEL_DEPLOY_HOOK_URL'} className={input} />
        </div>
        <div className="lg:col-span-2">
          <label className="block font-mono text-[11px] text-os-dim mb-1">Local checkout path (real verify)</label>
          <input
            name="localPath"
            defaultValue={editing?.localPath ?? ''}
            className={input}
            placeholder="C:\\path\\to\\repo (or /projects/app in Docker)"
          />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Verify command</label>
          <input
            name="verifyCommand"
            defaultValue={editing?.verifyCommand ?? ''}
            className={input}
            placeholder="pnpm run typecheck"
          />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Price (cents)</label>
          <input name="priceCents" type="number" defaultValue={String(editing?.priceCents ?? 4900)} className={input} />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Currency</label>
          <input name="currency" defaultValue={editing?.currency ?? 'USD'} className={input} />
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Status</label>
          <select name="status" defaultValue={editing?.status ?? 'draft'} className={input}>
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="paused">Paused</option>
          </select>
        </div>
        <div>
          <label className="block font-mono text-[11px] text-os-dim mb-1">Autonomy</label>
          <select name="autonomy" defaultValue={editing?.autonomy ?? 'assisted'} className={input}>
            <option value="observe">Observe only</option>
            <option value="assisted">Assisted (asks you)</option>
            <option value="autopilot">Autopilot</option>
          </select>
        </div>
        <div className="lg:col-span-3 flex flex-wrap items-end gap-3">
          <button type="submit" disabled={saving} className={PILL}>
            {saving ? (
              <RefreshCw size={13} className="animate-[om-spin_.8s_linear_infinite]" />
            ) : editing ? (
              'Save changes'
            ) : (
              'Add project'
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              router.push('/jarvis/settings');
              router.refresh();
            }}
            className={PILL}
          >
            Cancel
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => removeProject(editing)}
              disabled={saving}
              className={`${PILL} text-os-err`}
            >
              <Trash2 size={13} strokeWidth={1.7} /> Delete project
            </button>
          ) : null}
          {editing ? (
            <span className="font-mono text-[11px] text-os-dim">Editing {editing.name}</span>
          ) : null}
        </div>
      </div>
    </form>
  );
}
