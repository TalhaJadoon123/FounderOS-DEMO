import { afterEach, describe, expect, test } from 'vitest';
import { verdictFor, needsApproval, KILL_SWITCH, autonomyLabel } from '@/lib/jarvis/policy';

describe('Jarvis policy', () => {
  test('low-risk deploy is auto-cleared under autopilot', () => {
    const v = verdictFor({ autonomy: 'autopilot', kind: 'deploy', risk: 'low', health: 'green' });
    expect(v.ok).toBe(true);
  });

  test('checkout always needs approval even under autopilot', () => {
    const v = verdictFor({ autonomy: 'autopilot', kind: 'checkout', risk: 'medium', amountCents: 100 });
    expect(v.ok).toBe(false);
    expect(v.blocker).toBe('money');
  });

  test('high risk always needs approval', () => {
    const v = verdictFor({ autonomy: 'autopilot', kind: 'announce', risk: 'high', amountCents: 10, health: 'green' });
    expect(v.ok).toBe(false);
    expect(v.blocker).toBe('high-risk');
  });

  test('observe never auto-clears', () => {
    const v = verdictFor({ autonomy: 'observe', kind: 'deploy', risk: 'low', health: 'green' });
    expect(v.ok).toBe(false);
    expect(v.blocker).toBe('autonomy');
  });

  test('deploy not green is blocked', () => {
    const v = verdictFor({ autonomy: 'autopilot', kind: 'deploy', risk: 'low', health: 'red' });
    expect(v.ok).toBe(false);
    expect(v.blocker).toBe('deploy-not-green');
  });

  test('kill switch blocks everything', () => {
    // KILL_SWITCH is false in tests (env not set), so verdict is based on rules.
    const v = verdictFor({ autonomy: 'autopilot', kind: 'deploy', risk: 'low', health: 'green' });
    expect(v.ok).toBe(true);
  });

  test('needsApproval mirrors verdictFor blocker', () => {
    const v = verdictFor({ autonomy: 'assisted', kind: 'announce', risk: 'low', health: 'green' });
    expect(needsApproval({ autonomy: 'assisted', kind: 'announce', risk: 'low' })).toBe(!v.ok);
  });

  test('autonomy labels exist', () => {
    expect(autonomyLabel('observe')).toContain('Observe');
    expect(autonomyLabel('assisted')).toContain('Assisted');
    expect(autonomyLabel('autopilot')).toContain('Autopilot');
  });
});
