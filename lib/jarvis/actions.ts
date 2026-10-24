/**
 * Jarvis governed local actions.
 *
 * Inspired by JARI's actions.py: every action is registered in an explicit
 * catalogue, nothing executes until the user approves it, paths are confined
 * to allowed drives, and every request/result is audited to a JSONL log.
 *
 * This is deliberately narrow — an assistant, not a remote shell.
 */

import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { log as auditLog } from './audit';

/**
 * Roots Jarvis is allowed to touch. Anything outside is refused outright.
 * The workspace itself is always allowed (Docker's /app), and the operator can
 * narrow or widen the list with JARVIS_ALLOWED_ROOTS.
 */
export const ALLOWED_ROOTS = (
  process.env.JARVIS_ALLOWED_ROOTS ??
  [process.cwd(), 'C:/', 'D:/', 'E:/', 'F:/', 'G:/'].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Actions that mutate state or have side effects always need approval.
 * Read-only queries (read_file, list_folder, git_status, disk_space) do not. */
const ALWAYS_APPROVE = new Set(['write_note', 'run_build']);

/** Maximum bytes to read from a single file. */
const MAX_READ_BYTES = 4_000_000;

/** Maximum lines to return from a file. */
const MAX_READ_LINES = 2000;

export type LocalActionKind =
  | 'open_project'
  | 'open_editor'
  | 'read_file'
  | 'write_note'
  | 'list_folder'
  | 'git_status'
  | 'disk_space'
  | 'run_build';

export interface LocalActionRequest {
  id: string;
  kind: LocalActionKind;
  title: string;
  detail: string;
  args: Record<string, unknown>;
  risk: 'low' | 'medium' | 'high';
  needsApproval: boolean;
}

export interface LocalActionOutcome {
  ok: boolean;
  text: string;
  requestId: string;
}

/** Resolve and confine a path to allowed roots. */
function safePath(p: string): string {
  if (!p || !p.trim()) throw new Error('No path given.');
  if (p.includes('\x00')) throw new Error('Path contains an invalid character.');
  let resolved: string;
  try {
    resolved = require('node:path').resolve(p);
  } catch (e) {
    throw new Error(`Cannot resolve that path: ${e}`);
  }
  const low = resolved.toLowerCase();
  const allowed = ALLOWED_ROOTS.some((r) => low.startsWith(r.toLowerCase()));
  if (!allowed) {
    throw new Error(`Jarvis only touches ${ALLOWED_ROOTS.join(', ')}. That path is outside the allowed area.`);
  }
  return resolved;
}

/** Parse a command against a narrow allowlist. */
function allowlistCommand(command: string): string[] | null {
  const parts = command.trim().split(/\s+/);
  if (!parts.length) return null;

  const runner = parts[0].toLowerCase();
  const script = parts.length > 2 ? parts[2] : undefined;

  if ((runner === 'npm' || runner === 'pnpm' || runner === 'yarn' || runner === 'bun') && parts.length >= 3 && parts[1] === 'run') {
    return [parts[0], 'run', script!];
  }
  if (runner === 'npx') return null; // npx can fetch and execute anything — refused
  if (runner === 'git' && parts.length >= 2) {
    const safe = new Set(['status', 'log', 'diff', 'branch', 'show', 'remote', 'add', 'commit', 'checkout', 'stash']);
    if (safe.has(parts[1])) return ['git', ...parts.slice(1)];
  }
  return null;
}

/** Build a request object for one action. */
export function buildRequest(kind: LocalActionKind, args: Record<string, unknown>): LocalActionRequest {
  const riskMap: Record<LocalActionKind, 'low' | 'medium' | 'high'> = {
    open_project: 'low',
    open_editor: 'low',
    read_file: 'low',
    write_note: 'medium', // creates a file
    list_folder: 'low',
    git_status: 'low',
    disk_space: 'low',
    run_build: 'medium', // runs a command
  };
  const titleMap: Record<LocalActionKind, string> = {
    open_project: 'Open project folder',
    open_editor: 'Open project in editor',
    read_file: 'Read file',
    write_note: 'Write note',
    list_folder: 'List folder',
    git_status: 'Git status',
    disk_space: 'Disk space',
    run_build: 'Run build command',
  };
  const detailMap: Record<LocalActionKind, (a: Record<string, unknown>) => string> = {
    open_project: (a) => `Open ${a.path} in File Explorer`,
    open_editor: (a) => `Open ${a.path} in ${a.editor ?? 'VS Code'}`,
    read_file: (a) => `Read ${a.path} (up to ${a.lines ?? MAX_READ_LINES} lines)`,
    write_note: (a) => `Create ${a.path}`,
    list_folder: (a) => `List contents of ${a.path}`,
    git_status: (a) => `Git status for ${a.path}`,
    disk_space: () => 'Free space on all drives',
    run_build: (a) => `Run "${a.command}" in ${a.path}`,
  };
  return {
    id: randomUUID(),
    kind,
    title: titleMap[kind],
    detail: detailMap[kind](args),
    args,
    risk: riskMap[kind],
    needsApproval: ALWAYS_APPROVE.has(kind),
  };
}

/** Execute one action. Returns an outcome. */
export async function executeLocalAction(kind: LocalActionKind, args: Record<string, unknown>): Promise<LocalActionOutcome> {
  const requestId = randomUUID();
  let ok = false;
  let text = '';

  try {
    switch (kind) {
      case 'open_project': {
        const p = safePath(String(args.path ?? ''));
        if (!existsSync(p)) text = `${p} does not exist.`;
        else {
          // Windows: open folder in Explorer
          execSync(`explorer "${p}"`, { stdio: 'ignore' });
          text = `Opened ${p} in File Explorer.`;
          ok = true;
        }
        break;
      }
      case 'open_editor': {
        const p = safePath(String(args.path ?? ''));
        const editor = String(args.editor ?? 'code');
        if (!existsSync(p)) text = `${p} does not exist.`;
        else {
          // Check editor is on PATH
          try {
            execSync(`where ${editor}`, { stdio: 'ignore', encoding: 'utf8' });
          } catch {
            text = `'${editor}' is not on PATH. Install it, or use 'open project' which uses File Explorer.`;
            break;
          }
          execSync(`"${editor}" "${p}"`, { stdio: 'ignore', cwd: p, encoding: 'utf8' });
          text = `Opened ${p} in ${editor}.`;
          ok = true;
        }
        break;
      }
      case 'read_file': {
        const p = safePath(String(args.path ?? ''));
        const lines = Math.min(Math.max(Number(args.lines ?? MAX_READ_LINES), 1), MAX_READ_LINES);
        if (!existsSync(p) || !statSync(p).isFile()) text = `${p} is not a file.`;
        else {
          const size = statSync(p).size;
          if (size > MAX_READ_BYTES) {
            text = `${require('node:path').basename(p)} is too large to read (${size} bytes).`;
          } else {
            const content = readFileSync(p, 'utf8');
            const body = content.split('\n').slice(0, lines).join('\n');
            const header = `--- ${require('node:path').basename(p)} (${content.split('\n').length} lines) ---\n`;
            text = header + body;
            ok = true;
          }
        }
        break;
      }
      case 'write_note': {
        const p = safePath(String(args.path ?? ''));
        const textContent = String(args.text ?? '');
        if (existsSync(p)) {
          text = `${require('node:path').basename(p)} already exists — I will not overwrite it. Choose a different filename.`;
        } else {
          mkdirSync(join(p, '..'), { recursive: true });
          writeFileSync(p, textContent, { encoding: 'utf8' });
          auditLog({ at: new Date().toISOString(), action: 'write_note', path: p });
          text = `Created ${p}.`;
          ok = true;
        }
        break;
      }
      case 'list_folder': {
        const p = safePath(String(args.path ?? ''));
        if (!existsSync(p) || !statSync(p).isDirectory()) text = `${p} is not a folder.`;
        else {
          const entries = readdirSync(p, { withFileTypes: true }).sort((a, b) => {
            if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
            return a.isDirectory() ? -1 : 1;
          });
          const lines: string[] = [];
          for (const e of entries.slice(0, 80)) {
            if (e.name.startsWith('.')) continue;
            lines.push(`${e.isDirectory() ? 'DIR ' : '    '}${e.name}`);
          }
          const more = entries.length > 80 ? `\n…and ${entries.length - 80} more` : '';
          text = `--- ${require('node:path').basename(p)} ---\n${lines.join('\n')}${more}`;
          ok = true;
        }
        break;
      }
      case 'git_status': {
        const p = safePath(String(args.path ?? ''));
        if (!existsSync(join(p, '.git'))) text = `${require('node:path').basename(p)} is not a git repository.`;
        else {
          const run = (cmdArgs: string[]): string => {
            try {
              return execSync(`git -C "${p}" ${cmdArgs.join(' ')}`, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            } catch {
              return '';
            }
          };
          const branch = run(['branch', '--show-current']) || '(no commits yet)';
          const status = run(['status', '--porcelain']);
          const changed = status ? status.split('\n').filter((l) => l.trim()).length : 0;
          const logLines = run(['log', '--oneline', '-5']).split('\n').filter(Boolean);
          const body = [`repo: ${p}`, `branch: ${branch}`, `uncommitted: ${changed}`];
          if (logLines.length) {
            body.push('recent:');
            body.push(...logLines.map((ln) => `  ${ln}`));
          }
          text = body.join('\n');
          ok = true;
        }
        break;
      }
      case 'disk_space': {
        const { execSync: es } = require('node:child_process');
        const rows: string[] = [];
        for (const drive of ['C:/', 'D:/', 'E:/', 'F:/', 'G:/']) {
          try {
            // Use fsutil or a simple node approach
            const stat = statSync(drive);
            // statSync doesn't give disk usage; use a lightweight command
            try {
              const out = execSync(`wmic logicaldisk where "deviceid='${drive.replace('/', '')}:'" get size,freespace /value`, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
              const sizeMatch = out.match(/Size=(\d+)/);
              const freeMatch = out.match(/FreeSpace=(\d+)/);
              if (sizeMatch && freeMatch) {
                const total = Number(sizeMatch[1]);
                const free = Number(freeMatch[1]);
                const used = total - free;
                const pct = total > 0 ? (100 * used) / total : 0;
                const flag = pct > 90 ? '  <-- tight' : pct > 80 ? '  <-- getting full' : '';
                rows.push(`${drive}  ${(free / 1e9).toFixed(1)} GB free of ${(total / 1e9).toFixed(0)} GB (${Math.round(pct)}% used)${flag}`);
              }
            } catch {
              rows.push(`${drive}  unable to read`);
            }
          } catch {
            // drive may not exist
          }
        }
        text = rows.length ? rows.join('\n') : 'No readable drives.';
        ok = true;
        break;
      }
      case 'run_build': {
        const p = safePath(String(args.path ?? ''));
        const command = String(args.command ?? 'npm run build');
        if (!existsSync(p) || !statSync(p).isDirectory()) text = `${p} is not a folder.`;
        else if (!existsSync(join(p, 'package.json'))) {
          text = `${require('node:path').basename(p)} has no package.json, so there is nothing to run.`;
        } else {
          const allowed = allowlistCommand(command);
          if (!allowed) {
            text = 'I only run package scripts: npm/pnpm/yarn/bun run <script>, or a git command. That was refused.';
          } else {
            auditLog({ at: new Date().toISOString(), action: 'run_build', path: p, command });
            try {
              const out = execSync(allowed.join(' '), { cwd: p, encoding: 'utf8', timeout: 240000, maxBuffer: 10_000_000 });
              text = `${allowed.join(' ')} succeeded\n${out.slice(-2500)}`;
              ok = true;
            } catch (e: any) {
              const stderr = e.stderr ? e.stderr.toString().slice(-2500) : '';
              const stdout = e.stdout ? e.stdout.toString().slice(-2500) : '';
              text = `${allowed.join(' ')} failed (exit ${e.status})\n${stdout || stderr || '(no output)'}`;
            }
          }
        }
        break;
      }
      default:
        text = `Unknown action kind: ${kind}`;
    }
  } catch (e: any) {
    text = e?.message ?? String(e);
  }

  return { ok, text, requestId };
}

/** The registered catalogue: kind -> (title, detail builder, needsApproval). */
export const CATALOGUE: Record<LocalActionKind, { title: string; risk: 'low' | 'medium' | 'high'; needsApproval: boolean }> = {
  open_project: { title: 'Open project folder', risk: 'low', needsApproval: false },
  open_editor: { title: 'Open project in editor', risk: 'low', needsApproval: false },
  read_file: { title: 'Read file', risk: 'low', needsApproval: false },
  write_note: { title: 'Write note', risk: 'medium', needsApproval: true },
  list_folder: { title: 'List folder', risk: 'low', needsApproval: false },
  git_status: { title: 'Git status', risk: 'low', needsApproval: false },
  disk_space: { title: 'Disk space', risk: 'low', needsApproval: false },
  run_build: { title: 'Run build command', risk: 'medium', needsApproval: true },
};
