import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { logger, getRequestId, withRequestContext, redact, type LogContext } from '@/lib/jarvis/logging';

describe('Logging', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    originalEnv = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'debug';
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    if (originalEnv !== undefined) {
      process.env.LOG_LEVEL = originalEnv;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  describe('redact', () => {
    test('redacts password fields', () => {
      const result = redact({ password: 'secret123', username: 'john' });
      expect(result).toEqual({ password: '***REDACTED***', username: 'john' });
    });

    test('redacts token fields', () => {
      const result = redact({ token: 'abc123', data: 'value' });
      expect(result).toEqual({ token: '***REDACTED***', data: 'value' });
    });

    test('redacts nested secrets', () => {
      const result = redact({ 
        user: { 
          password: 'secret', 
          api_key: 'key123',
          name: 'John' 
        } 
      });
      expect(result).toEqual({
        user: { 
          password: '***REDACTED***', 
          api_key: '***REDACTED***',
          name: 'John' 
        }
      });
    });

    test('redacts array items', () => {
      const result = redact([
        { password: 'pass1' },
        { password: 'pass2' },
      ]);
      expect(result).toEqual([
        { password: '***REDACTED***' },
        { password: '***REDACTED***' },
      ]);
    });

    test('handles null and undefined', () => {
      expect(redact(null)).toBeNull();
      expect(redact(undefined)).toBeUndefined();
    });

    test('preserves non-sensitive fields', () => {
      const result = redact({ 
        name: 'John',
        email: 'john@example.com',
        age: 30,
      });
      expect(result).toEqual({
        name: 'John',
        email: 'john@example.com',
        age: 30,
      });
    });
  });

  describe('logger', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('debug logs when level is debug', () => {
      process.env.LOG_LEVEL = 'debug';
      logger.debug('Test message', { foo: 'bar' });
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test('info logs at info level', () => {
      process.env.LOG_LEVEL = 'info';
      logger.info('Info message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test('warn logs at warn level', () => {
      process.env.LOG_LEVEL = 'warn';
      logger.warn('Warning message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test('error logs to console.error', () => {
      process.env.LOG_LEVEL = 'error';
      logger.error('Error message', {}, new Error('Test error'));
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('fatal logs to console.error', () => {
      process.env.LOG_LEVEL = 'fatal';
      logger.fatal('Fatal error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('child logger inherits context', () => {
      process.env.LOG_LEVEL = 'debug';
      const child = logger.child({ userId: '123' });
      child.info('Child message', { action: 'test' });
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logged.context.userId).toBe('123');
    });

    test('request logging includes method, url, status, duration', () => {
      process.env.LOG_LEVEL = 'info';
      const req = new Request('http://localhost/api/test');
      logger.request(req, Date.now() - 100, 200);
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logged.message).toBe('HTTP Request');
      expect(logged.context.method).toBe('GET');
      expect(logged.context.statusCode).toBe(200);
      expect(logged.context.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('query logging', () => {
      process.env.LOG_LEVEL = 'debug';
      logger.query('SELECT * FROM users WHERE id = ?', [1], 5);
      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logged.message).toBe('DB Query');
      expect(logged.context.paramCount).toBe(1);
      expect(logged.context.durationMs).toBe(5);
    });

    test('external call logging', () => {
      process.env.LOG_LEVEL = 'info';
      logger.externalCall('Stripe', 'GET', 'https://api.stripe.com/v1/account', 200, 150);
      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logged.message).toBe('External API Call');
      expect(logged.context.service).toBe('Stripe');
      expect(logged.context.statusCode).toBe(200);
      expect(logged.context.durationMs).toBe(150);
    });
  });

  describe('getRequestId', () => {
    test('returns x-request-id header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-request-id': 'abc-123' },
      });
      expect(getRequestId(req)).toBe('abc-123');
    });

    test('returns x-correlation-id header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-correlation-id': 'corr-456' },
      });
      expect(getRequestId(req)).toBe('corr-456');
    });

    test('generates UUID when no header', () => {
      const req = new Request('http://localhost');
      const id = getRequestId(req);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('withRequestContext', () => {
    test('adds requestId to logger context', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const req = new Request('http://localhost', {
        headers: { 'x-request-id': 'req-789' },
      });
      const childLogger = withRequestContext(req);
      childLogger.info('Test with context');

      expect(logSpy).toHaveBeenCalled();
      const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(logged.context.requestId).toBe('req-789');
      logSpy.mockRestore();
    });
  });
});