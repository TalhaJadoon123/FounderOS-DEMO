/**
 * Local ingest auth for FounderOS funding/trading write endpoints.
 *
 * These endpoints are called by your local trading bot (MT5/Loopader) and
 * by you manually. They must not be open to the public internet.
 *
 * When JARVIS_LOCAL_INGEST_TOKEN is set, every write request must supply
 * it via Authorization: Bearer <token> or the x-jarvis-token header.
 * When unset, writes are allowed (dev convenience) but a warning is logged.
 *
 * In Docker, only the local-stack service and your bot container should
 * reach these routes; the Next.js middleware / reverse proxy should not
 * expose them publicly.
 */

import { NextResponse } from 'next/server';

export type AuthResult = { ok: boolean; token?: string; error?: string; status?: number };

/** Read the ingest token from env. Never logs the token value. */
export function ingestToken(): string | undefined {
  return process.env.JARVIS_LOCAL_INGEST_TOKEN;
}

/** Extract a bearer token from Authorization header or x-jarvis-token header. */
export function extractToken(headers: Headers): string | undefined {
  const auth = headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return headers.get('x-jarvis-token') ?? undefined;
}

/** Constant-time comparison to avoid timing leaks. */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify an incoming request's ingest token. Returns { ok } or { error, status }. */
export function verifyIngestAuth(headers: Headers): AuthResult {
  const expected = ingestToken();

  // Dev convenience: no token configured, allow but note it.
  if (!expected) {
    console.warn(
      '[jarvis-auth] JARVIS_LOCAL_INGEST_TOKEN not set — local ingest endpoints are open.',
    );
    return { ok: true };
  }

  const provided = extractToken(headers);
  if (!provided) {
    return { ok: false, error: 'missing ingest token', status: 401 };
  }
  if (!secureCompare(provided, expected)) {
    return { ok: false, error: 'invalid ingest token', status: 401 };
  }

  return { ok: true, token: provided };
}

/** Next.js middleware helper: returns a 401 response if auth fails, or null if ok. */
export function requireIngestAuth(headers: Headers): NextResponse | null {
  const result = verifyIngestAuth(headers);
  if (result.ok) return null;
  return NextResponse.json(
    { ok: false, error: result.error },
    { status: result.status ?? 401 },
  );
}
