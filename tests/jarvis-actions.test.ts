import { describe, expect, test } from 'vitest';
import { buildRequest, CATALOGUE } from '@/lib/jarvis/actions';

describe('jarvis actions catalogue', () => {
  test('catalogue has all action kinds', () => {
    const kinds: string[] = Object.keys(CATALOGUE);
    expect(kinds).toContain('open_project');
    expect(kinds).toContain('read_file');
    expect(kinds).toContain('run_build');
    expect(kinds).toContain('disk_space');
  });

  test('every catalogue entry has title, risk, needsApproval', () => {
    for (const [kind, entry] of Object.entries(CATALOGUE)) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(entry.risk);
      expect(typeof entry.needsApproval).toBe('boolean');
      // kind is a key of CATALOGUE
      expect(CATALOGUE[kind as keyof typeof CATALOGUE]).toBe(entry);
    }
  });

  test('buildRequest creates a valid request', () => {
    const req = buildRequest('open_project', { path: 'E:/my-project' });
    expect(req.id).toBeDefined();
    expect(req.kind).toBe('open_project');
    expect(req.title).toBe('Open project folder');
    expect(req.args.path).toBe('E:/my-project');
    expect(req.needsApproval).toBe(false);
  });

  test('write_note needs approval', () => {
    const req = buildRequest('write_note', { path: 'E:/note.txt', text: 'hello' });
    expect(req.needsApproval).toBe(true);
    expect(req.risk).toBe('medium');
  });

  test('disk_space does not need approval', () => {
    const req = buildRequest('disk_space', {});
    expect(req.needsApproval).toBe(false);
    expect(req.risk).toBe('low');
  });
});
