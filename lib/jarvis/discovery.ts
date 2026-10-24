/**
 * Jarvis project discovery — read-only scanning of local drives for projects.
 *
 * Inspired by JARI's projects.py: walks a set of root directories, detects
 * project type from marker files (package.json, pyproject.toml, Cargo.toml,
 * go.mod, Dockerfile, .sln, *.csproj), reads package.json for name/description,
 * and reports git branch + dirty count. Deliberately read-only — Jarvis never
 * edits a discovered project unless the operator explicitly approves it.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type ProjectKind = 'node' | 'python' | 'rust' | 'go' | 'docker' | 'dotnet';

export interface DiscoveredProject {
  name: string;
  path: string;
  kinds: ProjectKind[];
  description: string;
  gitBranch: string;
  dirty: number;
}

/** Marker file -> project kind. */
const MARKERS: Record<string, ProjectKind> = {
  'package.json': 'node',
  'pyproject.toml': 'python',
  'requirements.txt': 'python',
  'Cargo.toml': 'rust',
  'go.mod': 'go',
  'docker-compose.yml': 'docker',
  Dockerfile: 'docker',
  '*.sln': 'dotnet',
  '*.csproj': 'dotnet',
};

/** Folders that are never projects and are slow to walk. */
const SKIP = new Set([
  'node_modules',
  '.git',
  'venv',
  '.venv',
  'dist',
  'build',
  'target',
  '__pycache__',
  '.cache',
  '.next',
  'System Volume Information',
  '$RECYCLE.BIN',
  'steamapps',
  'Windows',
  'Program Files',
  'Program Files (x86)',
]);

/** Default roots to scan. Windows drives first, then home. */
export function defaultRoots(): string[] {
  const roots: string[] = [];
  for (const letter of ['E', 'D', 'C', 'F', 'G']) {
    roots.push(`${letter}:/`);
  }
  roots.push(process.env.HOMEPATH ?? process.env.USERPROFILE ?? require('node:os').homedir());
  return roots;
}

/** Read name + description from a package.json, if present. */
function readPackageJson(root: string): string {
  const p = join(root, 'package.json');
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const bits: string[] = [];
    if (data.name) bits.push(String(data.name));
    if (data.description) bits.push(String(data.description));
    return bits.join(' — ');
  } catch {
    return '';
  }
}

/** Git branch + dirty file count for a repo. Silent on failure. */
function gitInfo(root: string): { branch: string; dirty: number } {
  const run = (args: string[]): string => {
    try {
      return execSync(['git', '-C', root, ...args].join(' '), {
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };
  const branch = run(['branch', '--show-current']);
  const status = run(['status', '--porcelain']);
  const dirty = status ? status.split('\n').filter((l) => l.trim()).length : 0;
  return { branch, dirty };
}

/** Detect project kinds from marker files in a directory. */
function detectKinds(dir: string): ProjectKind[] {
  const kinds: ProjectKind[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return kinds;
  }
  for (const entry of entries) {
    const kind = MARKERS[entry];
    if (kind && !kinds.includes(kind)) kinds.push(kind);
    // glob patterns for .sln / *.csproj
    if (entry.endsWith('.sln') && !kinds.includes('dotnet')) kinds.push('dotnet');
    if (entry.endsWith('.csproj') && !kinds.includes('dotnet')) kinds.push('dotnet');
  }
  return kinds;
}

/** Walk a root directory, collecting project directories. */
function walkRoot(root: string, maxDepth: number, results: DiscoveredProject[]): void {
  try {
    statSync(root);
  } catch {
    return;
  }

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).map((e) => e.name);
    } catch {
      return;
    }

    const kinds = detectKinds(dir);
    if (kinds.length > 0) {
      // This directory is a project — record it and don't descend further.
      const desc = readPackageJson(dir) || '';
      const { branch, dirty } = gitInfo(dir);
      results.push({
        name: require('node:path').basename(dir) || dir,
        path: dir,
        kinds,
        description: desc,
        gitBranch: branch,
        dirty,
      });
      return;
    }

    for (const name of entries) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1);
      } catch {
        // skip
      }
    }
  };

  walk(root, 0);
}

/**
 * Scan all default roots for projects. Returns a de-duplicated list.
 * Safe to call from a server API route.
 */
export function discoverProjects(options?: { roots?: string[]; maxDepth?: number }): DiscoveredProject[] {
  const roots = options?.roots ?? defaultRoots();
  const maxDepth = options?.maxDepth ?? 2;
  const results: DiscoveredProject[] = [];

  for (const root of roots) {
    try {
      walkRoot(root, maxDepth, results);
    } catch {
      // one bad root must not kill the whole scan
    }
  }

  // De-duplicate by path, keeping the first (shallowest) occurrence.
  const seen = new Set<string>();
  const unique: DiscoveredProject[] = [];
  for (const p of results) {
    if (!seen.has(p.path)) {
      seen.add(p.path);
      unique.push(p);
    }
  }

  // Sort: node projects first, then alphabetically.
  unique.sort((a, b) => {
    const aNode = a.kinds.includes('node') ? 0 : 1;
    const bNode = b.kinds.includes('node') ? 0 : 1;
    if (aNode !== bNode) return aNode - bNode;
    return a.name.localeCompare(b.name);
  });

  return unique;
}
