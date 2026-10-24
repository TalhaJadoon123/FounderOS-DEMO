import { GATED, connected as gatedConnected } from '@/lib/connectors/demo-status';
import fs from 'node:fs';
import { delimiter, join } from 'node:path';
import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * One connector for the local machine stack: running services and installed
 * daily-driver CLIs. Everything here is checked live.
 *
 * "Connected" means the whole declared stack is present. A partial stack is
 * reported as not_configured with the exact up/down split — 1 of 7 services
 * must never paint the row green.
 */

type Check = { name: string; up: boolean; detail: string };

function ping(url: string, timeoutMs = 1500): Promise<boolean> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).then(
    (r) => r.status > 0 && r.status < 500,
    () => false,
  );
}

/**
 * Resolve a binary by absolute path or by name on PATH. The old version only
 * looked in macOS Homebrew locations, so a Windows or Docker host reported
 * every CLI as missing even when it was installed.
 */
function binExists(...candidates: Array<string | null | undefined>): string | null {
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
      : [''];
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const mode = process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const explicit = candidate.includes('/') || candidate.includes('\\');
    const paths = explicit
      ? [candidate]
      : dirs.flatMap((dir) => [join(dir, candidate), ...exts.map((ext) => join(dir, candidate + ext))]);
    for (const file of paths) {
      try {
        fs.accessSync(file, mode);
        return file;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

/**
 * The conventional local ports. They are documentation, not auto-detection:
 * another app can be listening on 3100 (it happened), so a service only counts
 * when the operator has explicitly pointed at it with the env var.
 */
const DEFAULT_PAPERCLIP_URL = 'http://localhost:3100';
const DEFAULT_HERMES_URL = 'http://localhost:8642';

const clean = (url: string | undefined): string | null => (url ? url.replace(/\/$/, '') : null);
const paperclipUrl = (): string | null => clean(process.env.PAPERCLIP_API_URL);
const hermesUrl = (): string | null => clean(process.env.HERMES_GATEWAY_URL);

/** A configured service is up if either its health route or its root answers. */
async function serviceUp(base: string | null): Promise<boolean> {
  if (!base) return false;
  if (await ping(`${base}/health`)) return true;
  return ping(base);
}

export async function localStackStatus(): Promise<ConnectorStatus> {
  if (GATED) return gatedConnected('local-stack', 'Local Stack', 'local', 'services up');

  // Design choice: this lists ONLY what Founder OS itself runs or shells out
  // to. Anything reached through a hosted API instead of a local process was
  // dropped from this panel: reporting on it made the panel look broken
  // while conveying nothing about the OS's actual local dependencies.
  // No self-check: if you are reading this panel the OS is obviously up.
  const pUrl = paperclipUrl();
  const hUrl = hermesUrl();
  const [paperclipBoard, hermesGateway] = await Promise.all([serviceUp(pUrl), serviceUp(hUrl)]);

  const checks: Check[] = [
    {
      name: 'paperclip',
      up: paperclipBoard,
      detail: pUrl
        ? `agent board · ${pUrl.replace(/^https?:\/\//, '')}`
        : `PAPERCLIP_API_URL not set (default ${DEFAULT_PAPERCLIP_URL.replace(/^https?:\/\//, '')})`,
    },
    {
      name: 'hermes',
      up: hermesGateway,
      detail: hUrl
        ? `worker pool · ${hUrl.replace(/^https?:\/\//, '')}`
        : `HERMES_GATEWAY_URL not set (default ${DEFAULT_HERMES_URL.replace(/^https?:\/\//, '')})`,
    },
    { name: 'gbrain', up: Boolean(binExists(process.env.GBRAIN_BIN, 'gbrain')), detail: 'knowledge CLI behind /brain' },
    { name: 'ffmpeg', up: Boolean(binExists('ffmpeg')), detail: 'content-gen media processing' },
    { name: 'pdftotext', up: Boolean(binExists('pdftotext')), detail: 'statement ingestion (/finances)' },
    { name: 'whisper', up: Boolean(binExists('whisper-cli', 'whisper')), detail: 'local transcription' },
    { name: 'gh', up: Boolean(binExists('gh')), detail: 'GitHub CLI · deploys' },
  ];

  const up = checks.filter((c) => c.up);
  const downNames = checks.filter((c) => !c.up).map((c) => c.name);
  const meta: Record<string, string | number> = {};
  for (const check of checks) meta[check.name] = check.up ? `up · ${check.detail}` : 'down';

  return {
    id: 'local-stack',
    name: 'Local Stack',
    kind: 'local',
    // Full stack only. A partial install is a setup task, not a green light.
    state: up.length === checks.length ? 'connected' : 'not_configured',
    detail: `${up.length}/${checks.length} up${
      up.length ? ` — ${up.map((c) => c.name).join(', ')}` : ''
    }${downNames.length ? ` · down: ${downNames.join(', ')}` : ''}`,
    meta,
  };
}
