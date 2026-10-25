import { describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { hasBrandMark } from '@/lib/brand-logos';
import { TOOL_BRANDS, toolBrand } from '@/lib/workflow-tool-brands';

describe('workflow tool brands', () => {
  test('no seeded workflows — tools set is empty', () => {
    const db = openDb(':memory:');
    seedDatabase(db);
    const tools = new Set(db.workflows.all().flatMap((w) => w.steps.flatMap((s) => s.tools)));
    db.close();
    expect(tools.size).toBe(0);
  });

  test('display names are human, not raw ids', () => {
    expect(toolBrand('ghl').name).toBe('GoHighLevel');
    expect(toolBrand('calendar').name).toBe('Google Calendar');
    expect(toolBrand('gmail').slug).toBe('gmail');
  });

  test('unknown tools degrade to an identity brand (lettermark fallback downstream)', () => {
    expect(toolBrand('mystery-tool')).toEqual({ slug: 'mystery-tool', name: 'mystery-tool' });
  });
});