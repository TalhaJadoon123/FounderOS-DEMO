/**
 * Unified Error Handling
 * 
 * Standardized error responses across all API routes
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export enum ErrorCode {
  // Auth errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_JSON = 'INVALID_JSON',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_FIELD = 'INVALID_FIELD',
  
  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',
  
  // Rate limiting
  RATE_LIMITED = 'RATE_LIMITED',
  
  // External service errors
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_SERVICE_TIMEOUT = 'EXTERNAL_SERVICE_TIMEOUT',
  
  // Internal errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  
  // Business logic errors
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_OPERATION = 'INVALID_OPERATION',
  DEPENDENCY_FAILED = 'DEPENDENCY_FAILED',
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export interface ErrorResponse {
  ok: false;
  error: ApiError;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toResponse(requestId?: string): NextResponse<ErrorResponse> {
    return NextResponse.json<ErrorResponse>(
      {
        ok: false,
        error: {
          code: this.code,
          message: this.message,
          details: this.details,
          requestId: requestId || this.requestId,
        },
      },
      { status: this.statusCode }
    );
  }
}

// Predefined error creators
export const errors = {
  unauthorized: (message = 'Authentication required', details?: Record<string, unknown>) =>
    new AppError(ErrorCode.UNAUTHORIZED, message, 401, details),

  forbidden: (message = 'Access denied', details?: Record<string, unknown>) =>
    new AppError(ErrorCode.FORBIDDEN, message, 403, details),

  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details),

  invalidJson: () =>
    new AppError(ErrorCode.INVALID_JSON, 'Invalid JSON in request body', 400),

  missingField: (field: string) =>
    new AppError(ErrorCode.MISSING_FIELD, `Required field missing: ${field}`, 400, { field }),

  notFound: (resource: string, id?: string) =>
    new AppError(
      ErrorCode.NOT_FOUND,
      `${resource} not found${id ? `: ${id}` : ''}`,
      404,
      { resource, id }
    ),

  conflict: (message: string, details?: Record<string, unknown>) =>
    new AppError(ErrorCode.CONFLICT, message, 409, details),

  rateLimited: (retryAfter?: number) =>
    new AppError(
      ErrorCode.RATE_LIMITED,
      'Too many requests',
      429,
      retryAfter ? { retryAfter } : undefined
    ),

  internal: (message = 'Internal server error', details?: Record<string, unknown>) =>
    new AppError(ErrorCode.INTERNAL_ERROR, message, 500, details),

  database: (message = 'Database operation failed', details?: Record<string, unknown>) =>
    new AppError(ErrorCode.DATABASE_ERROR, message, 500, details),

  externalService: (service: string, message: string, details?: Record<string, unknown>) =>
    new AppError(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `${service}: ${message}`,
      502,
      { service, ...details }
    ),

  externalTimeout: (service: string) =>
    new AppError(
      ErrorCode.EXTERNAL_SERVICE_TIMEOUT,
      `${service} request timed out`,
      504,
      { service }
    ),

  insufficientFunds: (current: number, required: number) =>
    new AppError(
      ErrorCode.INSUFFICIENT_FUNDS,
      'Insufficient funds for operation',
      409,
      { current, required }
    ),

  invalidOperation: (message: string, details?: Record<string, unknown>) =>
    new AppError(ErrorCode.INVALID_OPERATION, message, 400, details),
};

// Error handler wrapper for API routes
export function handleError(
  error: unknown,
  requestId?: string
): NextResponse<ErrorResponse> {
  if (error instanceof AppError) {
    return error.toResponse(requestId);
  }

  if (error instanceof ZodError) {
    return new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Validation failed',
      400,
      { issues: error.errors }
    ).toResponse(requestId);
  }

  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    return errors.invalidJson().toResponse(requestId);
  }

  // Log unexpected errors
  console.error('[API Error]', {
    requestId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return errors.internal('An unexpected error occurred').toResponse(requestId);
}

// Async route wrapper with error handling
export function withErrorHandling<T extends Request>(
  handler: (req: T) => Promise<NextResponse>
) {
  return async (req: T): Promise<NextResponse> => {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    
    try {
      const response = await handler(req);
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      return handleError(error, requestId);
    }
  };
}

// Validation helper
export function validateBody<T>(
  schema: { parse: (data: unknown) => T },
  body: unknown
): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid request body',
        400,
        { issues: error.errors }
      );
    }
    throw error;
  }
}