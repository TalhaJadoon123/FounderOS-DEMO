import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Two honesty fixes.
 *
 * 1. ManyChat read "planned" in the Content section while the connector was
 *    reporting connected against a live Instagram Pro account. A seeded status
 *    that contradicts a live connector is the exact thing this OS is not
 *    supposed to do.
 * 2. The sidebar footer hardcoded "localhost:4100", which is a lie whenever
 *    the OS is served from the host, and it was pinned nowrap so it overflowed
 *    the rail and got clipped.
 * 
 * NO seeded ManyChat agent or tool â€” create from the OS.
 */
describe('ManyChat reads live, not planned', () => {
  test('no ManyChat agent is seeded', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    const agent = db.agents.all().find((a) => a.id === 'dmflow-mcp');
    expect(agent).toBeUndefined();
    db.close();
  });

  test('no ManyChat tool is seeded', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    const tool = db.tools.all().find((t) => t.id === 'tool-dmflow');
    expect(tool).toBeUndefined();
    db.close();
  });
});

describe('sidebar footer tells the truth about where it is running', () => {
  const sidebar = read('components/Sidebar.tsx');

  test('the host is read at runtime, not hardcoded to localhost', () => {
    expect(sidebar).not.toContain('localhost:4100 Â· sqlite Â· real agents');
    expect(sidebar).toContain('location.host');
  });

  test('the footer line can wrap instead of overflowing the rail', () => {
    // the old markup pinned this line nowrap at 10px inside a 232px rail,
    // so "real agents" ran off the edge and got clipped
    const footer = sidebar.slice(sidebar.indexOf('systems live'));
    const line = footer.slice(0, footer.indexOf('</div>', footer.indexOf('sqlite')));
    expect(line).not.toContain('whitespace-nowrap');
  });
});

