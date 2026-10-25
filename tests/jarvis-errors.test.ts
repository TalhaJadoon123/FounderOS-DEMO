import { describe, expect, test, vi } from 'vitest';
import {
  AppError,
  errors,
  ErrorCode,
  handleError,
  validateBody,
  withErrorHandling,
} from '@/lib/jarvis/errors';
import { ZodError } from 'zod';
import { z } from 'zod';

describe('Error Handling', () => {
  describe('AppError', () => {
    test('creates error with code and message', () => {
      const err = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input', 400);
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.message).toBe('Invalid input');
      expect(err.statusCode).toBe(400);
    });

    test('toResponse returns proper NextResponse', () => {
      const err = new AppError(ErrorCode.NOT_FOUND, 'User not found', 404, { userId: '123' });
      const response = err.toResponse('req-123');
      
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('predefined errors', () => {
    test('errors.unauthorized', () => {
      const err = errors.unauthorized('Login required');
      expect(err.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(err.statusCode).toBe(401);
    });

    test('errors.forbidden', () => {
      const err = errors.forbidden('Admin only');
      expect(err.code).toBe(ErrorCode.FORBIDDEN);
      expect(err.statusCode).toBe(403);
    });

    test('errors.validation', () => {
      const err = errors.validation('Email invalid', { field: 'email' });
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.details?.field).toBe('email');
    });

    test('errors.missingField', () => {
      const err = errors.missingField('email');
      expect(err.code).toBe(ErrorCode.MISSING_FIELD);
      expect(err.details?.field).toBe('email');
    });

    test('errors.notFound', () => {
      const err = errors.notFound('User', '123');
      expect(err.code).toBe(ErrorCode.NOT_FOUND);
      expect(err.details?.resource).toBe('User');
      expect(err.details?.id).toBe('123');
    });

    test('errors.rateLimited', () => {
      const err = errors.rateLimited(60);
      expect(err.code).toBe(ErrorCode.RATE_LIMITED);
      expect(err.statusCode).toBe(429);
      expect(err.details?.retryAfter).toBe(60);
    });

    test('errors.insufficientFunds', () => {
      const err = errors.insufficientFunds(100, 500);
      expect(err.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
      expect(err.details?.current).toBe(100);
      expect(err.details?.required).toBe(500);
    });

    test('errors.externalService', () => {
      const err = errors.externalService('Stripe', 'Connection failed', { code: 'conn_failed' });
      expect(err.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(err.details?.service).toBe('Stripe');
    });
  });

  describe('handleError', () => {
    test('handles AppError', () => {
      const err = new AppError(ErrorCode.VALIDATION_ERROR, 'Test error', 400);
      const response = handleError(err, 'req-123');
      
      expect(response.status).toBe(400);
    });

    test('handles ZodError', () => {
      const schema = z.object({ email: z.string().email() });
      const result = schema.safeParse({ email: 'invalid' });
      
      if (!result.success) {
        const response = handleError(result.error, 'req-123');
        expect(response.status).toBe(400);
      }
    });

    test('handles SyntaxError (invalid JSON)', () => {
      const err = new SyntaxError('Unexpected token');
      (err as any).status = 400;
      const response = handleError(err, 'req-123');
      expect(response.status).toBe(400);
    });

    test('handles unknown error', () => {
      const response = handleError(new Error('Random error'), 'req-123');
      expect(response.status).toBe(500);
    });
  });

  describe('validateBody', () => {
    test('returns parsed data on success', () => {
      const schema = z.object({ name: z.string() });
      const result = validateBody(schema, { name: 'John' });
      expect(result.name).toBe('John');
    });

    test('throws AppError on validation failure', () => {
      const schema = z.object({ email: z.string().email() });
      expect(() => validateBody(schema, { email: 'invalid' })).toThrow(AppError);
    });
  });

  describe('withErrorHandling', () => {
    test('wraps handler and catches errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      const wrapped = withErrorHandling(handler);
      
      const req = new Request('http://localhost/test');
      const response = await wrapped(req);
      
      expect(response.status).toBe(500);
    });

    test('passes through successful responses', async () => {
      const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const wrapped = withErrorHandling(handler);
      
      const req = new Request('http://localhost/test');
      const response = await wrapped(req);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('x-request-id')).toBeDefined();
    });
  });
});