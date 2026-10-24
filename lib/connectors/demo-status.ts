import type { ConnectorStatus, ConnectorKind } from '@/lib/connectors/types';

/**
 * Demo status helper — retained only so existing connector modules keep a
 * stable import. `GATED` is always false: no deployment ever fabricates a
 * connected state. A connector is connected only when its own live probe
 * succeeded.
 */
export const GATED = false;

export function connected(id: string, name: string, kind: ConnectorKind, detail: string): ConnectorStatus {
  return { id, name, kind, state: 'connected', detail };
}
