/**
 * Zero-dependency env loading.
 *
 * Loads `.env` into `process.env` without clobbering real environment
 * variables. Safe to call repeatedly; only does work once per process.
 *
 * Walk up from the working directory to find `.env`, so `pnpm --filter`
 * and monorepo sub-commands still find it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

let loaded = false;

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
      if (rawLine.includes('"')) value = value.replace(/\\n/g, '\n');
    }
    out[key] = value;
  }
  return out;
}

/** Walks up from `startDir` looking for a `.env` file. */
export function findEnvFile(startDir: string = process.cwd(), maxDepth = 6): string | null {
  let dir = resolve(startDir);
  for (let i = 0; i < maxDepth; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Loads `.env` into `process.env`. Never clobbers a variable already set
 * in the real environment (deploy-time secrets win).
 */
export function loadEnv(options: { path?: string; override?: boolean } = {}): string | null {
  const path = options.path ?? findEnvFile();
  if (!path || !existsSync(path)) return null;
  const parsed = parseEnvFile(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (options.override || process.env[key] === undefined) process.env[key] = value;
  }
  loaded = true;
  return path;
}

export function envLoaded(): boolean {
  return loaded;
}

/** Reads an env var, falling back to `fallback` when unset or blank. */
export function env(name: string, fallback = ''): string {
  if (!loaded && process.env.NODE_ENV !== 'test') loadEnv();
  const value = process.env[name];
  if (value === undefined || value === null || value.trim() === '') return fallback;
  return value.trim();
}

export function envBool(name: string, fallback = false): boolean {
  const value = env(name, '').toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

export function envInt(name: string, fallback: number): number {
  const value = env(name, '');
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envList(name: string, fallback: string[]): string[] {
  const value = env(name, '');
  if (!value) return fallback;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Throws a helpful error naming every missing key. */
export function requireEnv(...names: string[]): Record<string, string> {
  const missing = names.filter((name) => !env(name));
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env.local and fill them in.',
    );
  }
  const out: Record<string, string> = {};
  for (const name of names) out[name] = env(name);
  return out;
}

/** Resolves a repo-root-relative path such as `./data/uploads`. */
export function resolveFromRoot(value: string): string {
  const envFile = findEnvFile();
  const root = envFile ? dirname(envFile) : process.cwd();
  return isAbsolute(value) ? value : resolve(join(root, value));
}
