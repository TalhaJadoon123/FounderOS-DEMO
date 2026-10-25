'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Self-contained API reference. Deliberately does not load Swagger UI from a
 * CDN: FounderOS is a local/private app and this page must work offline.
 * The source of truth is GET /api/openapi.
 */

type Operation = {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: unknown[];
  deprecated?: boolean;
};

type PathItem = Record<string, Operation | unknown>;

type Spec = {
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, PathItem>;
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asSpec(value: unknown): Spec | null {
  if (!isObject(value)) return null;
  const info = isObject(value.info)
    ? {
        title: typeof value.info.title === 'string' ? value.info.title : undefined,
        version: typeof value.info.version === 'string' ? value.info.version : undefined,
        description:
          typeof value.info.description === 'string' ? value.info.description : undefined,
      }
    : undefined;
  const paths = isObject(value.paths) ? (value.paths as Record<string, PathItem>) : undefined;
  return { info, paths };
}

type Row = {
  method: string;
  path: string;
  summary: string;
  tags: string[];
  auth: boolean;
  deprecated: boolean;
};

const METHOD_COLOR: Record<string, string> = {
  get: '#3B82F6',
  post: '#22C55E',
  put: '#F59E0B',
  patch: '#A855F7',
  delete: '#EF4444',
};

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/openapi')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((json) => {
        if (cancelled) return;
        const parsed = asSpec(json);
        if (!parsed) throw new Error('OpenAPI response was not an object');
        setSpec(parsed);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!spec?.paths) return [];
    const out: Row[] = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const method of METHODS) {
        const op = item[method];
        if (!isObject(op)) continue;
        out.push({
          method,
          path,
          summary: typeof op.summary === 'string' ? op.summary : '',
          tags: Array.isArray(op.tags) ? op.tags.filter((t): t is string => typeof t === 'string') : [],
          auth: Array.isArray(op.security) && op.security.length > 0,
          deprecated: op.deprecated === true,
        });
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  }, [spec]);

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '48px 24px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#e5e5e5', background: '#0a0a0a', minHeight: '100vh' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#8a8a8a' }}>
        Founder OS · API
      </div>
      <h1 style={{ fontSize: 28, margin: '10px 0 8px', fontWeight: 700 }}>
        {spec?.info?.title ?? 'API reference'}
      </h1>
      <p style={{ color: '#8a8a8a', fontSize: 13, lineHeight: 1.6, maxWidth: 720 }}>
        {spec?.info?.description ??
          'The machine-readable contract is at /api/openapi (OpenAPI 3.1). Writes require the local ingest bearer token.'}
      </p>
      <p style={{ color: '#666', fontSize: 12 }}>
        version {spec?.info?.version ?? '—'} · {rows.length} operations
      </p>

      {error && (
        <p style={{ color: '#EF4444', fontSize: 13, border: '1px solid #3a1d1d', padding: 12 }}>
          Could not load the spec: {error}
        </p>
      )}

      <div style={{ marginTop: 28, border: '1px solid #242424' }}>
        {rows.map((row, index) => (
          <div
            key={`${row.method}-${row.path}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '72px minmax(240px, 1.2fr) 2fr',
              gap: 16,
              alignItems: 'center',
              padding: '12px 16px',
              borderTop: index === 0 ? 'none' : '1px solid #1c1c1c',
              opacity: row.deprecated ? 0.5 : 1,
            }}
          >
            <span style={{ color: METHOD_COLOR[row.method] ?? '#aaa', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
              {row.method.toUpperCase()}
            </span>
            <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
              {row.path}
              {row.auth && (
                <span title="Requires Authorization: Bearer <JARVIS_LOCAL_INGEST_TOKEN>" style={{ marginLeft: 8, color: '#F59E0B', fontSize: 11 }}>
                  auth
                </span>
              )}
            </span>
            <span style={{ color: '#9a9a9a', fontSize: 12 }}>
              {row.summary}
              {row.tags.length > 0 && (
                <span style={{ color: '#555', marginLeft: 8 }}>{row.tags.join(' · ')}</span>
              )}
            </span>
          </div>
        ))}
        {!error && rows.length === 0 && (
          <div style={{ padding: 16, color: '#666', fontSize: 13 }}>Loading spec…</div>
        )}
      </div>

      <h2 style={{ fontSize: 15, marginTop: 36 }}>Example: sync the bot</h2>
      <pre style={{ background: '#111', border: '1px solid #242424', padding: 16, overflowX: 'auto', fontSize: 12, lineHeight: 1.7 }}>
{`curl -X POST http://localhost:4100/api/finances/bot-sync \\
  -H "Authorization: Bearer $JARVIS_LOCAL_INGEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"loopader","account":{"account_balance":10000,"account_equity":10500,"account_margin_free":9000,"positions":[]}}'`}
      </pre>
      <p style={{ color: '#666', fontSize: 12 }}>
        Full contract and MT5 checklist: <code>docs/BOT_INTEGRATION.md</code>
      </p>
    </main>
  );
}
