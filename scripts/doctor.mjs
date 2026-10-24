/**
 * Founder OS doctor — verifies the whole stack boots and answers, end to end.
 *
 *   pnpm run doctor
 *
 * Exits 0 when everything is green, non-zero otherwise.
 */

import { loadEnv } from '@/lib/shared/env';
import { getDb, closeDb } from '@/lib/data';

loadEnv();

let failures = 0;
let warnings = 0;

function ok(label, detail = '') {
  console.log(`  [ok]   ${label}${detail ? ` - ${detail}` : ''}`);
}
function warn(label, detail) {
  warnings += 1;
  console.log(`  [warn] ${label} - ${detail}`);
}
function bad(label, detail) {
  failures += 1;
  console.log(`  [FAIL] ${label} - ${detail}`);
}

console.log('Founder OS doctor\n');

// --- Node -------------------------------------------------------------------
const [major] = process.versions.node.split('.').map(Number);
if (major >= 22) {
  ok('Node', process.version);
} else {
  bad('Node', `${process.version} - need 22+`);
}

// --- Database ---------------------------------------------------------------
try {
  const db = getDb();
  const depts = db.departments.all();
  const agents = db.agents.all();
  ok('Database', `${depts.length} departments, ${agents.length} agents`);
  closeDb();
} catch (err) {
  bad('Database', err instanceof Error ? err.message : String(err));
}

// --- Jarvis tables ----------------------------------------------------------
try {
  const db = getDb();
  const projects = db.jarvis.projects.all();
  ok('Jarvis', `${projects.length} project(s) registered`);
  closeDb();
} catch (err) {
  bad('Jarvis', err instanceof Error ? err.message : String(err));
}

// --- TypeScript -------------------------------------------------------------
try {
  const fs = await import('node:fs');
  const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  ok('TypeScript', `tsconfig present (strict=${tsconfig.compilerOptions?.strict ?? 'unknown'})`);
} catch (err) {
  bad('TypeScript', err instanceof Error ? err.message : String(err));
}

// --- Env --------------------------------------------------------------------
const required = ['FOUNDER_OS_ACCESS_TOKEN'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  warn('Env', `Missing: ${missing.join(', ')} (set in .env.local for production)`);
} else {
  ok('Env', 'Required variables present');
}

console.log(`\n${failures === 0 ? 'All checks passed' : failures + ' failure(s)'} (warnings: ${warnings})\n`);

process.exit(failures > 0 ? 1 : 0);
