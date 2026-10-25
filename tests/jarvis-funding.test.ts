process.env.FOUNDER_OS_DB = ':memory:';

import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { recordLocalFunding, recordTradePnl, reconcileProject, listLedger, exportLedgerCsv } from '@/lib/jarvis/revenue';
import { getDb, closeDb } from '@/lib/data';

describe('Funding Ledger', () => {
  const projectId = 'test-project-funding';

  beforeEach(() => {
    closeDb();
    const db = getDb();
    // Seed a project
    const now = new Date().toISOString();
    db.jarvis.projects.upsert({
      id: projectId,
      name: 'Test Funding Project',
      repo: '',
      branch: 'main',
      deployUrl: '',
      healthUrl: '',
      checkoutUrl: '',
      stripePriceId: '',
      deployHookEnv: 'VERCEL_DEPLOY_HOOK_URL',
      localPath: '',
      verifyCommand: '',
      priceCents: 0,
      currency: 'USD',
      status: 'live',
      autonomy: 'assisted',
      health: 'unknown',
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
    });
  });

  afterEach(() => {
    closeDb();
  });

  describe('recordLocalFunding', () => {
    test('records a deposit with positive amount', () => {
      const revenue = recordLocalFunding({
        projectId,
        amountCents: 10000,
        currency: 'USD',
        type: 'deposit',
        reference: 'dep-001',
        note: 'Test deposit',
      });

      expect(revenue.source).toBe('deposit');
      expect(revenue.amountCents).toBe(10000);
      expect(revenue.netCents).toBe(10000);
      expect(revenue.status).toBe('paid');
    });

    test('records a withdrawal with negative amount', () => {
      const revenue = recordLocalFunding({
        projectId,
        amountCents: 5000,
        currency: 'USD',
        type: 'withdrawal',
        reference: 'wd-001',
        note: 'Test withdrawal',
      });

      expect(revenue.source).toBe('withdrawal');
      expect(revenue.amountCents).toBe(-5000);
      expect(revenue.netCents).toBe(-5000);
      expect(revenue.status).toBe('withdrawn');
    });

    test('is idempotent - same reference returns existing', () => {
      const rev1 = recordLocalFunding({
        projectId,
        amountCents: 10000,
        type: 'deposit',
        reference: 'idem-001',
      });

      const rev2 = recordLocalFunding({
        projectId,
        amountCents: 20000, // Different amount
        type: 'deposit',
        reference: 'idem-001', // Same reference
      });

      expect(rev1.id).toBe(rev2.id);
      expect(rev1.amountCents).toBe(10000); // Original amount preserved
    });

    test('handles fees correctly', () => {
      const revenue = recordLocalFunding({
        projectId,
        amountCents: 10000,
        type: 'deposit',
        reference: 'fee-001',
        feeCents: 300,
      });

      expect(revenue.feeCents).toBe(300);
      expect(revenue.netCents).toBe(9700);
    });

    test('withdrawal fees reduce net', () => {
      const revenue = recordLocalFunding({
        projectId,
        amountCents: 5000,
        type: 'withdrawal',
        reference: 'fee-wd-001',
        feeCents: 100,
      });

      expect(revenue.amountCents).toBe(-5000);
      expect(revenue.feeCents).toBe(100);
      expect(revenue.netCents).toBe(-5100); // -5000 - 100
    });
  });

  describe('recordTradePnl', () => {
    test('records profit as positive', () => {
      const revenue = recordTradePnl({
        projectId,
        amountCents: 2500,
        currency: 'USD',
        reference: 'trade-001',
        symbol: 'EURUSD',
        note: 'Winning trade',
      });

      expect(revenue.source).toBe('trade_pnl');
      expect(revenue.amountCents).toBe(2500);
      expect(revenue.netCents).toBe(2500);
      expect(revenue.status).toBe('paid');
    });

    test('records loss as negative', () => {
      const revenue = recordTradePnl({
        projectId,
        amountCents: -1500,
        reference: 'trade-002',
        symbol: 'GBPUSD',
      });

      expect(revenue.amountCents).toBe(-1500);
      expect(revenue.netCents).toBe(-1500);
      expect(revenue.status).toBe('loss');
    });

    test('handles trade fees', () => {
      const revenue = recordTradePnl({
        projectId,
        amountCents: 5000,
        reference: 'trade-fee-001',
        feeCents: 50,
      });

      expect(revenue.feeCents).toBe(50);
      expect(revenue.netCents).toBe(4950);
    });

    test('is idempotent by reference', () => {
      const rev1 = recordTradePnl({
        projectId,
        amountCents: 1000,
        reference: 'trade-idem-001',
      });

      const rev2 = recordTradePnl({
        projectId,
        amountCents: 2000,
        reference: 'trade-idem-001',
      });

      expect(rev1.id).toBe(rev2.id);
      expect(rev1.amountCents).toBe(1000);
    });
  });

  describe('reconcileProject', () => {
    test('reconciles empty project', () => {
      const rec = reconcileProject(projectId);
      expect(rec.grossCents).toBe(0);
      expect(rec.feeCents).toBe(0);
      expect(rec.netCents).toBe(0);
      expect(rec.count).toBe(0);
      expect(rec.bySource).toEqual([]);
    });

    test('reconciles mixed transactions', () => {
      recordLocalFunding({ projectId, amountCents: 10000, type: 'deposit', reference: 'd1' });
      recordLocalFunding({ projectId, amountCents: 2000, type: 'withdrawal', reference: 'w1' });
      recordTradePnl({ projectId, amountCents: 500, reference: 't1' });
      recordTradePnl({ projectId, amountCents: -300, reference: 't2' });
      recordLocalFunding({ projectId, amountCents: 1000, type: 'deposit', reference: 'd2', feeCents: 30 });

      const rec = reconcileProject(projectId);
      // Gross: 10000 - 2000 + 500 - 300 + 1000 = 9200
      expect(rec.grossCents).toBe(9200);
      // Fees: 30
      expect(rec.feeCents).toBe(30);
      // Net: 9200 - 30 = 9170
      expect(rec.netCents).toBe(9170);
      expect(rec.count).toBe(5);
      expect(rec.bySource.length).toBe(3);
    });
  });

  describe('listLedger', () => {
    test('lists all entries for project', () => {
      recordLocalFunding({ projectId, amountCents: 10000, type: 'deposit', reference: 'd1' });
      recordLocalFunding({ projectId, amountCents: 2000, type: 'withdrawal', reference: 'w1' });

      const ledger = listLedger({ projectId });
      expect(ledger.length).toBe(2);
      expect(ledger.map((r) => r.externalId).sort()).toEqual(['d1', 'w1']);
    });

    test('filters by source', () => {
      recordLocalFunding({ projectId, amountCents: 10000, type: 'deposit', reference: 'd1' });
      recordLocalFunding({ projectId, amountCents: 2000, type: 'withdrawal', reference: 'w1' });
      recordTradePnl({ projectId, amountCents: 500, reference: 't1' });

      const deposits = listLedger({ projectId, source: 'deposit' });
      expect(deposits.length).toBe(1);
      expect(deposits[0].source).toBe('deposit');
    });

    test('supports pagination', () => {
      for (let i = 0; i < 5; i++) {
        recordLocalFunding({ projectId, amountCents: 1000, type: 'deposit', reference: `d${i}` });
      }

      const page1 = listLedger({ projectId, limit: 2, offset: 0 });
      const page2 = listLedger({ projectId, limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].externalId).not.toBe(page2[0].externalId);
    });
  });

  describe('exportLedgerCsv', () => {
    test('exports CSV with headers and TOTALS row', () => {
      recordLocalFunding({ projectId, amountCents: 10000, type: 'deposit', reference: 'd1' });
      recordLocalFunding({ projectId, amountCents: 2000, type: 'withdrawal', reference: 'w1' });

      const csv = exportLedgerCsv({ projectId });
      const lines = csv.trim().split('\n');

      expect(lines[0]).toContain('id,project_id,source,external_id,customer,amount_cents,fee_cents,net_cents,currency,status,occurred_at');
      expect(lines.length).toBe(4); // header + 2 data + totals
      expect(lines[3]).toContain('TOTALS');
      expect(lines[3]).toContain('8000'); // 10000 - 2000
    });
  });

  describe('balanceCents', () => {
    test('returns correct balance', () => {
      const db = getDb();
      const balance = db.jarvis.revenue.balanceCents(projectId);
      expect(balance.gross).toBe(0);
      expect(balance.net).toBe(0);

      recordLocalFunding({ projectId, amountCents: 10000, type: 'deposit', reference: 'd1' });
      recordLocalFunding({ projectId, amountCents: 3000, type: 'withdrawal', reference: 'w1' });

      const balance2 = db.jarvis.revenue.balanceCents(projectId);
      expect(balance2.gross).toBe(7000);
      expect(balance2.net).toBe(7000);
      expect(balance2.count).toBe(2);
      closeDb();
    });
  });
});