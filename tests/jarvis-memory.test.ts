import { afterEach, describe, expect, test } from 'vitest';
import { addMemory, memoryContext, readMemory, resetMemory } from '@/lib/jarvis/memory';

describe('jarvis memory', () => {
  afterEach(() => {
    resetMemory();
  });

  test('add and read memory', () => {
    addMemory('What is my name?', 'You are Alex.', 'identity');
    const mem = readMemory(4000);
    expect(mem).toContain('Alex');
    expect(mem).toContain('identity');
  });

  test('memoryContext returns recent entries', () => {
    addMemory('Where do I work?', 'At Vantage.', 'work');
    const ctx = memoryContext();
    expect(ctx).toContain('Vantage');
  });

  test('resetMemory clears everything', () => {
    addMemory('Test', 'Value', 'tag');
    resetMemory();
    const mem = readMemory(4000);
    expect(mem).not.toContain('Test');
  });
});
