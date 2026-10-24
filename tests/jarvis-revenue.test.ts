import { describe, expect, test, vi, afterEach } from 'vitest';
import { mapSessionToRevenue, syncStripeRevenue } from '@/lib/jarvis/revenue';
import { killSwitchActive } from '@/lib/jarvis/policy';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Stripe revenue attribution', () => {
  test('maps a completed attributed session into the ledger', () => {
    const row = mapSessionToRevenue(
      {
        id: 'cs_test_123',
        amount_total: 4900,
        currency: 'usd',
        created: 1_760_000_000,
        customer_details: { email: 'buyer@example.com' },
        metadata: { projectId: 'proj-1' },
      },
      new Set(['proj-1']),
    );
    expect(row).toEqual({
      id: 'jarvis-rev-cs_test_123',
      projectId: 'proj-1',
      source: 'stripe',
      externalId: 'cs_test_123',
      customer: 'buyer@example.com',
      amountCents: 4900,
      currency: 'USD',
      status: 'paid',
      occurredAt: new Date(1_760_000_000_000).toISOString(),
    });
  });

  test('accepts client_reference_id as attribution', () => {
    const row = mapSessionToRevenue(
      { id: 'cs_2', amount_total: 100, currency: 'eur', client_reference_id: 'proj-2' },
      new Set(['proj-2']),
    );
    expect(row?.projectId).toBe('proj-2');
    expect(row?.currency).toBe('EUR');
  });

  test('drops unattributed, unknown, and zero-value sessions', () => {
    const known = new Set(['proj-1']);
    expect(mapSessionToRevenue({ id: 'a', amount_total: 100, currency: 'usd' }, known)).toBeNull();
    expect(
      mapSessionToRevenue({ id: 'b', amount_total: 100, currency: 'usd', metadata: { projectId: 'nope' } }, known),
    ).toBeNull();
    expect(
      mapSessionToRevenue({ id: 'c', amount_total: 0, currency: 'usd', metadata: { projectId: 'proj-1' } }, known),
    ).toBeNull();
  });

  test('no key means no network call and an honest skipped result', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const result = await syncStripeRevenue();
    expect(result.ok).toBe(false);
    expect(result.synced).toBe(0);
    expect(result.summary).toContain('STRIPE_SECRET_KEY not set');
  });
});

describe('kill switch', () => {
  test('env or persisted intent pauses Jarvis', () => {
    expect(killSwitchActive(null)).toBe(false);
    expect(killSwitchActive('off')).toBe(false);
    expect(killSwitchActive('on')).toBe(true);
  });
});
