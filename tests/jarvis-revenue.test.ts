import { describe, expect, test, vi, afterEach } from 'vitest';
import {
  mapPaymentToRevenue,
  syncStripeRevenue,
  syncWiseRevenue,
  syncNowPaymentsRevenue,
  syncAllRevenue,
} from '@/lib/jarvis/revenue';
import { killSwitchActive } from '@/lib/jarvis/policy';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Revenue attribution', () => {
  test('maps a Stripe payment into the ledger', () => {
    const row = mapPaymentToRevenue(
      {
        id: 'cs_test_123',
        amount: 49.00,
        currency: 'usd',
        created: 1_760_000_000,
        customer: 'buyer@example.com',
        metadata: { projectId: 'proj-1' },
      },
      'stripe',
      new Set(['proj-1']),
    );
    expect(row).toEqual({
      id: 'jarvis-rev-stripe-cs_test_123',
      projectId: 'proj-1',
      source: 'stripe',
      externalId: 'cs_test_123',
      customer: 'buyer@example.com',
      amountCents: 4900,
      feeCents: 0,
      netCents: 4900,
      currency: 'USD',
      status: 'paid',
      occurredAt: new Date(1_760_000_000_000).toISOString(),
    });
  });

  test('maps a Wise transfer into the ledger', () => {
    const row = mapPaymentToRevenue(
      {
        id: 'trx_wise_123',
        amount: 100.00,
        currency: 'EUR',
        created: 1_760_000_000,
        customer: 'buyer@example.com',
        metadata: { projectId: 'proj-2' },
      },
      'wise',
      new Set(['proj-2']),
    );
    expect(row?.source).toBe('wise');
    expect(row?.amountCents).toBe(10000);
    expect(row?.currency).toBe('EUR');
  });

  test('maps a NOWPayments payment into the ledger', () => {
    const row = mapPaymentToRevenue(
      {
        id: 'np_payment_456',
        amount: 250.50,
        currency: 'usd',
        created: 1_760_000_100,
        customer: 'customer@example.com',
        metadata: { orderId: 'proj-3' },
      },
      'nowpayments',
      new Set(['proj-3']),
    );
    expect(row?.source).toBe('nowpayments');
    expect(row?.amountCents).toBe(25050);
  });

  test('records a deposit as positive amount', () => {
    const row = mapPaymentToRevenue(
      {
        id: 'dep_123',
        amount: 500.00,
        currency: 'usd',
        created: 1_760_000_200,
        customer: '',
        metadata: { projectId: 'proj-1' },
      },
      'deposit',
      new Set(['proj-1']),
      'deposit',
    );
    expect(row?.amountCents).toBe(50000);
    expect(row?.source).toBe('deposit');
    expect(row?.status).toBe('paid');
  });

  test('records a withdrawal as negative amount', () => {
    const row = mapPaymentToRevenue(
      {
        id: 'wd_123',
        amount: 200.00,
        currency: 'usd',
        created: 1_760_000_300,
        customer: '',
        metadata: { projectId: 'proj-1' },
      },
      'withdrawal',
      new Set(['proj-1']),
      'withdrawal',
    );
    expect(row?.amountCents).toBe(-20000);
    expect(row?.source).toBe('withdrawal');
    expect(row?.status).toBe('withdrawn');
  });

  test('drops unattributed, unknown, and zero-value payments', () => {
    const known = new Set(['proj-1']);
    expect(
      mapPaymentToRevenue({ id: 'a', amount: 100, currency: 'usd' }, 'stripe', known),
    ).toBeNull();
    expect(
      mapPaymentToRevenue(
        { id: 'b', amount: 100, currency: 'usd', metadata: { projectId: 'nope' } },
        'stripe',
        known,
      ),
    ).toBeNull();
    expect(
      mapPaymentToRevenue(
        { id: 'c', amount: 0, currency: 'usd', metadata: { projectId: 'proj-1' } },
        'stripe',
        known,
      ),
    ).toBeNull();
  });

  test('records trade P&L with positive and negative amounts', () => {
    const profit = mapPaymentToRevenue(
      { id: 't1', amount: 75.50, currency: 'usd', created: 1_760_000_400, customer: '', metadata: { projectId: 'proj-1' } },
      'trade_pnl',
      new Set(['proj-1']),
      'trade_pnl',
    );
    expect(profit?.amountCents).toBe(7550);
    expect(profit?.status).toBe('paid');

    const loss = mapPaymentToRevenue(
      { id: 't2', amount: -30.00, currency: 'usd', created: 1_760_000_500, customer: '', metadata: { projectId: 'proj-1' } },
      'trade_pnl',
      new Set(['proj-1']),
      'trade_pnl',
    );
    // amount is -30, so Math.round(-30 * 100) = -3000
    expect(loss?.amountCents).toBe(-3000);
    expect(loss?.status).toBe('loss');
  });

  test('no Stripe key means honest skipped result', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const result = await syncStripeRevenue();
    expect(result.ok).toBe(false);
    expect(result.synced).toBe(0);
    expect(result.summary).toContain('STRIPE_SECRET_KEY not set');
  });

  test('no Wise key means honest skipped result', async () => {
    vi.stubEnv('WISE_API_KEY', '');
    const result = await syncWiseRevenue();
    expect(result.ok).toBe(false);
    expect(result.synced).toBe(0);
    expect(result.summary).toContain('WISE_API_KEY not set');
  });

  test('no NOWPayments key means honest skipped result', async () => {
    vi.stubEnv('NOWPAYMENTS_API_KEY', '');
    const result = await syncNowPaymentsRevenue();
    expect(result.ok).toBe(false);
    expect(result.synced).toBe(0);
    expect(result.summary).toContain('NOWPAYMENTS_API_KEY not set');
  });

  test('syncAllRevenue returns per-provider results', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('WISE_API_KEY', '');
    vi.stubEnv('NOWPAYMENTS_API_KEY', '');
    const result = await syncAllRevenue();
    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(3);
    expect(result.results.map((r) => r.provider)).toEqual([
      'stripe',
      'wise',
      'nowpayments',
    ]);
    expect(result.synced).toBe(0);
    expect(result.scanned).toBe(0);
  });
});

describe('kill switch', () => {
  test('env or persisted intent pauses Jarvis', () => {
    expect(killSwitchActive(null)).toBe(false);
    expect(killSwitchActive('off')).toBe(false);
    expect(killSwitchActive('on')).toBe(true);
  });
});
