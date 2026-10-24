import { afterEach, describe, expect, test } from 'vitest';
import { log as auditLog, readTail } from '@/lib/jarvis/audit';

describe('jarvis audit', () => {
  test('append and read tail', () => {
    auditLog({ action: 'test_action', path: '/tmp/test', ok: true });
    auditLog({ action: 'test_action_2', path: '/tmp/test2', ok: false });
    const records = readTail(10);
    expect(records.length).toBeGreaterThanOrEqual(2);
    const last = records[records.length - 1];
    expect(last.action).toBe('test_action_2');
    expect(last.ok).toBe(false);
  });

  test('readTail with n=0 returns empty', () => {
    expect(readTail(0)).toEqual([]);
  });
});
