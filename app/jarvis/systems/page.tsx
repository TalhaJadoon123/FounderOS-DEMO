/**
 * Jarvis → Systems — the real connection board.
 *
 * The page runs every connector probe on load and renders exactly what
 * answered. No cached green lights, no seeded "connected" rows.
 */

import Link from 'next/link';
import { Slab, SlabTitle, PILL } from '@/components/slab';
import { JarvisSystemsBoard } from '@/components/JarvisSystemsBoard';
import { listSystems } from '@/lib/jarvis/systems';

export const dynamic = 'force-dynamic';

export default async function JarvisSystemsPage() {
  const report = await listSystems();

  return (
    <Slab>
      <SlabTitle
        eyebrow="jarvis — systems"
        title="Live systems"
        meta={`${report.counts.connected}/${report.counts.total} connected by real probe right now — ${report.counts.notConfigured} need credentials, ${report.counts.error} returned an error`}
        right={
          <>
            <Link href="/jarvis" className={PILL}>
              Dashboard
            </Link>
            <Link href="/jarvis/settings" className={PILL}>
              Settings
            </Link>
          </>
        }
      />
      <JarvisSystemsBoard initial={report} />
    </Slab>
  );
}
