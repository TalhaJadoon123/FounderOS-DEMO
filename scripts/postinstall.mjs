/**
 * Copies .env.example -> .env.local if .env.local does not exist yet.
 * Safe to run repeatedly. Runs automatically on `pnpm install` via postinstall.
 * Never throws: Docker builds run this before the source tree is fully
 * copied, so a missing file must not break the install.
 */

import { existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const target = join(root, '.env.local');
  const source = join(root, '.env.example');

  if (existsSync(target)) {
    console.log('[postinstall] .env.local already exists, leaving it alone.');
  } else if (existsSync(source)) {
    copyFileSync(source, target);
    console.log('[postinstall] created .env.local from .env.example');
  } else {
    console.log('[postinstall] no .env.example found, skipping.');
  }
} catch (err) {
  console.warn('[postinstall] skipped:', err instanceof Error ? err.message : String(err));
}
