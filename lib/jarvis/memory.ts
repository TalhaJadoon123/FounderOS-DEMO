/**
 * Jarvis persistent memory — a human-readable memory.md file.
 *
 * Inspired by JARI's memory.md: two files, both human-readable on purpose so
 * the operator can open memory.md in Notepad and see exactly what Jarvis was
 * told. Lives alongside the DB, not inside it.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where memory.md lives. Defaults to <app root>/memory.md. */
export const MEMORY_PATH = join(process.cwd(), 'memory.md');
export const SEED_PATH = join(process.cwd(), 'memory.seed.md');

/** Read the tail of memory.md (last N characters). */
export function readMemory(limit = 4000): string {
  try {
    return readFileSync(MEMORY_PATH, 'utf8').slice(-limit);
  } catch {
    return '';
  }
}

/** Append a new entry to memory.md. */
export function addMemory(question: string, answer: string, tag = 'note'): void {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const entry = `\n### ${tag} — ${stamp}\n**Q:** ${question.trim()}\n**A:** ${answer.trim()}\n`;
  try {
    if (!existsSync(MEMORY_PATH)) {
      const seed = existsSync(SEED_PATH) ? readFileSync(SEED_PATH, 'utf8') : '# Jarvis Memory\n\nWhat Jarvis has learned about you and your setup.\n';
      writeFileSync(MEMORY_PATH, seed, 'utf8');
    }
    appendFileSync(MEMORY_PATH, entry, 'utf8');
  } catch (e) {
    console.warn('[jarvis memory] could not write:', e instanceof Error ? e.message : String(e));
  }
}

/** The slice of memory that goes into a system prompt. */
export function memoryContext(): string {
  return readMemory(4000);
}

/** Reset memory to a blank slate. */
export function resetMemory(): void {
  writeFileSync(MEMORY_PATH, '# Jarvis Memory\n\n', 'utf8');
}
