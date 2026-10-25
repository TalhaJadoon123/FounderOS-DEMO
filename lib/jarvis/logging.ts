/**
 * Structured Logging
 * 
 * JSON-structured logging with redaction, correlation IDs, and levels
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function configuredLevel(): number {
  return LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'] ?? 20;
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const sensitiveKeys = new Set([
  'password', 'token', 'secret', 'key', 'auth', 'authorization',
  'credit_card', 'ssn', 'api_key', 'apikey', 'access_token',
  'refresh_token', 'private_key', 'secret_key',
]);

export function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (Array.from(sensitiveKeys).some((k) => lowerKey.includes(k))) {
      result[key] = '***REDACTED***';
    } else {
      result[key] = redact(value);
    }
  }
  return result;
}

function formatEntry(level: LogLevel, message: string, context: LogContext, error?: Error): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: redact(context) as LogContext,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : undefined,
  };
}

function writeEntry(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === 'error' || entry.level === 'fatal') {
    console.error(line);
  } else {
    console.log(line);
  }
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= configuredLevel();
}

export const logger = {
  debug: (message: string, context: LogContext = {}) => {
    if (shouldLog('debug')) writeEntry(formatEntry('debug', message, context));
  },

  info: (message: string, context: LogContext = {}) => {
    if (shouldLog('info')) writeEntry(formatEntry('info', message, context));
  },

  warn: (message: string, context: LogContext = {}) => {
    if (shouldLog('warn')) writeEntry(formatEntry('warn', message, context));
  },

  error: (message: string, context: LogContext = {}, error?: Error) => {
    if (shouldLog('error')) writeEntry(formatEntry('error', message, context, error));
  },

  fatal: (message: string, context: LogContext = {}, error?: Error) => {
    if (shouldLog('fatal')) writeEntry(formatEntry('fatal', message, context, error));
  },

  // Child logger with bound context
  child: (baseContext: LogContext) => ({
    debug: (message: string, context: LogContext = {}) => 
      logger.debug(message, { ...baseContext, ...context }),
    info: (message: string, context: LogContext = {}) => 
      logger.info(message, { ...baseContext, ...context }),
    warn: (message: string, context: LogContext = {}) => 
      logger.warn(message, { ...baseContext, ...context }),
    error: (message: string, context: LogContext = {}, error?: Error) => 
      logger.error(message, { ...baseContext, ...context }, error),
    fatal: (message: string, context: LogContext = {}, error?: Error) => 
      logger.fatal(message, { ...baseContext, ...context }, error),
  }),

  // HTTP request logging
  request: (req: Request, startTime: number, statusCode: number) => {
    const duration = Date.now() - startTime;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode,
      durationMs: Date.now() - startTime,
      userAgent: req.headers.get('user-agent') || 'unknown',
    });
  },

  // Database query logging
  query: (query: string, params: unknown[], durationMs: number) => {
    logger.debug('DB Query', {
      query: query.substring(0, 200),
      paramCount: params.length,
      durationMs,
    });
  },

  // External API call logging
  externalCall: (service: string, method: string, url: string, statusCode: number, durationMs: number) => {
    logger.info('External API Call', {
      service,
      method,
      url: url.replace(/\?.*$/, ''), // Remove query params
      statusCode,
      durationMs,
    });
  },
};

// Request ID middleware helper
export function getRequestId(req: Request): string {
  return req.headers.get('x-request-id') || 
         req.headers.get('x-correlation-id') || 
         crypto.randomUUID();
}

// Logger with request context
export function withRequestContext(req: Request) {
  const requestId = getRequestId(req);
  return logger.child({ requestId });
}

