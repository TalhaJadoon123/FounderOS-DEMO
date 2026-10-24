/**
 * Jarvis audit log — append-only JSONL trail.
 *
 * Every Jarvis action, decision, and run is recorded here so the operator
 * can always see what ran, what it cost, and what is waiting on them.
 * Append-only: nothing is ever edited or deleted.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const AUDIT_PATH = join(process.cwd(), 'data', 'jarvis-audit.jsonl');

function ensureDir(): void {
  const dir = join(process.cwd(), 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Append one audit record. Never throws — a broken audit log must not stop Jarvis. */
export function log(record: object): void {
  try {
    ensureDir();
    const line = JSON.stringify({ at: new Date().toISOString(), ...record }, null, 0);
    appendFileSync(AUDIT_PATH, line + '\n', 'utf8');
  } catch {
    // silent — audit must never take down the assistant
  }
}

/** Read the last N records from the audit log. */
export function readTail(n = 100): Array<{ at: string; [key: string]: unknown }> {
  try {
    const content = require('node:fs').readFileSync(AUDIT_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (n <= 0) return [];
    return lines.slice(-n).map((l: string) => JSON.parse(l));
  } catch {
    return [];
  }
}
