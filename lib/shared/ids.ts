/**
 * Id generation and slugging. Uses node:crypto where available (API/tests),
 * and falls back to a tiny PRNG in the browser.
 *
 * Prefixed ids make logs, URLs and audit trails far easier to read:
 *   `jrv_9f3a2b7c`  instead of a bare UUID.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBytes(n: number): Uint8Array {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) return g.crypto.getRandomValues(new Uint8Array(n));
  const arr = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

function randomHex(n: number): string {
  return Array.from(randomBytes(n))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** RFC 4122 v4 UUID. */
export function uuid(): string {
  const b = randomBytes(16);
  b[6] = (b[6] as number & 0x0f) | 0x40;
  b[8] = (b[8] as number & 0x3f) | 0x80;
  const hex = Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Prefixed id used everywhere: `jrv_9f3a2b7c`.
 */
export function id(prefix: string): string {
  return `${prefix}_${randomHex(8)}`;
}

/** Longer token for portal deep links and OAuth state. */
export function token(bytes = 24): string {
  return randomHex(bytes);
}

export function slug(input: string, maxLength = 60): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return base || 'untitled';
}

/** Cheap, stable, non-reversible hash for dedupe keys and fingerprints. */
export function fingerprint(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0;
    h2 = (h2 ^ (h2 << 7)) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

export function shortCode(n = 6): string {
  return Array.from(randomBytes(n))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');
}
