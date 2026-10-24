/**
 * Deployment gate predicate for host-private data.
 *
 * This is NOT a demo mode and it never fabricates a connector status. It only
 * decides whether this process may read host-private surfaces — local chat
 * databases, installed skill files, the local brain store, transcript folders.
 * On a public demo host those reads must be skipped so a visitor can never see
 * the operator's machine; in Docker or local dev the gate is open and every
 * surface is live.
 *
 * `GATED` in lib/connectors/demo-status.ts is deliberately a separate constant
 * and stays false: no deployment ever turns a missing key into a green light.
 */
export function isGated(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEMO_GATE === '1') return true;
  if (env.DEMO_GATE === '0') return false;
  // Known public deployment platforms. Railway does not set VERCEL.
  return Boolean(env.VERCEL || env.RAILWAY_ENVIRONMENT);
}
