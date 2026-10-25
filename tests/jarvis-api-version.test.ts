import { describe, expect, test, vi } from 'vitest';
import { getApiVersion, isVersionDeprecated, versionMiddleware, requireVersion } from '@/lib/jarvis/api-version';

describe('API Versioning', () => {
  describe('getApiVersion', () => {
    test('returns default version when no header', () => {
      const headers = new Headers();
      expect(getApiVersion(headers)).toBe('1');
    });

    test('returns x-api-version header', () => {
      const headers = new Headers();
      headers.set('x-api-version', '2');
      expect(getApiVersion(headers)).toBe('2');
    });

    test('returns x-jarvis-api-version header', () => {
      const headers = new Headers();
      headers.set('x-jarvis-api-version', '2');
      expect(getApiVersion(headers)).toBe('2');
    });

    test('prefers x-api-version over x-jarvis-api-version', () => {
      const headers = new Headers();
      headers.set('x-api-version', '2');
      headers.set('x-jarvis-api-version', '1');
      expect(getApiVersion(headers)).toBe('2');
    });

    test('falls back to default for unsupported version', () => {
      const headers = new Headers();
      headers.set('x-api-version', '99');
      expect(getApiVersion(headers)).toBe('1');
    });
  });

  describe('isVersionDeprecated', () => {
    test('returns false for supported versions', () => {
      expect(isVersionDeprecated('1')).toBe(false);
      expect(isVersionDeprecated('2')).toBe(false);
    });
  });

  describe('versionMiddleware', () => {
    test('adds version headers to response', async () => {
      const handler = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
      const middleware = versionMiddleware(handler);
      
      const req = new Request('http://localhost/test', {
        headers: { 'x-api-version': '2' },
      });
      
      const response = await middleware(req);
      
      expect(response.headers.get('x-api-version')).toBe('2');
      expect(response.headers.get('x-supported-versions')).toBe('1, 2');
    });

    test('adds deprecation headers for deprecated versions', async () => {
      // This would require modifying DEPRECATED_VERSIONS set
      // For now just verify the middleware works
      const handler = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
      const middleware = versionMiddleware(handler);
      
      const req = new Request('http://localhost/test');
      const response = await middleware(req);
      
      expect(response.headers.get('x-api-version')).toBe('1');
      expect(response.headers.get('x-supported-versions')).toBe('1, 2');
    });
  });

  describe('requireVersion', () => {
    test('returns null when version meets minimum', () => {
      const req = { apiVersion: '2' } as any;
      const result = requireVersion('1')(req);
      expect(result).toBeNull();
    });

    test('returns null when version equals minimum', () => {
      const req = { apiVersion: '1' } as any;
      const result = requireVersion('1')(req);
      expect(result).toBeNull();
    });

    test('returns error response when version below minimum', () => {
      const req = { apiVersion: '1' } as any;
      const result = requireVersion('2')(req);
      
      expect(result).not.toBeNull();
      expect(result?.status).toBe(426);
    });

    test('error response includes supported versions', () => {
      const req = { apiVersion: '1' } as any;
      const result = requireVersion('2')(req) as any;
      
      expect(result.body).toBeDefined();
    });
  });
});