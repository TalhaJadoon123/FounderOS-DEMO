process.env.FOUNDER_OS_DB = ':memory:';

import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { quickHealthCheck, runHealthChecks } from '@/lib/jarvis/health';
import { getDb, closeDb } from '@/lib/data';

describe('Health Checks', () => {
  beforeEach(() => {
    closeDb();
    getDb();
  });

  afterEach(() => {
    closeDb();
  });

  describe('quickHealthCheck', () => {
    test('returns ok when database accessible', async () => {
      const result = await quickHealthCheck();
      expect(result.ok).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    test('returns not ok when database unavailable', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'founder-health-bad-'));
      const badPath = path.join(dir, 'unopenable.db');
      mkdirSync(badPath); // a directory where SQLite expects a file
      const previous = process.env.FOUNDER_OS_DB;

      closeDb();
      process.env.FOUNDER_OS_DB = badPath;
      try {
        const result = await quickHealthCheck();
        expect(result.ok).toBe(false);
      } finally {
        process.env.FOUNDER_OS_DB = previous;
        closeDb();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('runHealthChecks', () => {
    test('returns healthy status for fresh database', async () => {
      const report = await runHealthChecks();

      expect(report.status).toBe('healthy');
      expect(report.timestamp).toBeDefined();
      expect(report.version).toBeDefined();
      expect(report.uptimeMs).toBeGreaterThanOrEqual(0);
      expect(report.checks).toBeInstanceOf(Array);
      expect(report.checks.length).toBeGreaterThan(0);
    });

    test('includes database check', async () => {
      const report = await runHealthChecks();
      const dbCheck = report.checks.find((c) => c.name === 'database');

      expect(dbCheck).toBeDefined();
      expect(dbCheck?.status).toBe('healthy');
      expect(dbCheck?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(dbCheck?.details?.connected).toBe(true);
    });

    test('includes disk check with real free space', async () => {
      const report = await runHealthChecks();
      const diskCheck = report.checks.find((c) => c.name === 'disk');

      expect(diskCheck).toBeDefined();
      expect(diskCheck?.status).toBe('healthy');
      expect(diskCheck?.details?.freeSpaceGb).toBeGreaterThan(0);
      expect(diskCheck?.details?.totalSpaceGb).toBeGreaterThanOrEqual(
        diskCheck?.details?.freeSpaceGb as number,
      );
    });

    test('does not report a fake Redis check', async () => {
      const report = await runHealthChecks();
      expect(report.checks.some((c) => c.name === 'redis')).toBe(false);
    });

    test('overall status is unhealthy when database fails', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'founder-health-bad-'));
      const badPath = path.join(dir, 'unopenable.db');
      mkdirSync(badPath);
      const previous = process.env.FOUNDER_OS_DB;

      closeDb();
      process.env.FOUNDER_OS_DB = badPath;
      try {
        const report = await runHealthChecks();

        expect(report.status).toBe('unhealthy');
        const dbCheck = report.checks.find((c) => c.name === 'database');
        expect(dbCheck?.status).toBe('unhealthy');
      } finally {
        process.env.FOUNDER_OS_DB = previous;
        closeDb();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
