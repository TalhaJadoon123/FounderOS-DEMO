/**
 * OpenAPI 3.1 Specification Generator
 * 
 * Generates OpenAPI spec from route definitions
 */

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    contact?: { name: string; email?: string; url?: string };
    license?: { name: string; url?: string };
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, PathItem>;
  components: Components;
  tags: Tag[];
  security: SecurityRequirement[];
}

export interface PathItem {
  [method: string]: Operation;
}

export interface Operation {
  summary: string;
  description?: string;
  operationId: string;
  tags: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema: Schema;
  example?: unknown;
}

export interface RequestBody {
  description?: string;
  content: Record<string, MediaType>;
  required?: boolean;
}

export interface MediaType {
  schema: Schema;
  example?: unknown;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, Header>;
}

export interface Header {
  description?: string;
  schema: Schema;
}

export interface Schema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  format?: string;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  additionalProperties?: boolean | Schema;
  example?: unknown;
  nullable?: boolean;
  $ref?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
}

export interface Components {
  schemas?: Record<string, Schema>;
  responses?: Record<string, Response>;
  parameters?: Record<string, Parameter>;
  examples?: Record<string, { value: unknown }>;
  securitySchemes?: Record<string, SecurityScheme>;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
}

export interface SecurityRequirement {
  [name: string]: string[];
}

export interface Tag {
  name: string;
  description?: string;
  externalDocs?: { description: string; url: string };
}

// FounderOS specific schemas
export const commonSchemas: Record<string, Schema> = {
  Error: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string', example: 'Invalid request body' },
          details: { type: 'object' },
          requestId: { type: 'string', example: 'abc123' },
        },
        required: ['code', 'message'],
      },
    },
    required: ['ok', 'error'],
  },
  Success: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', example: true },
    },
    required: ['ok'],
  },
  Revenue: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'jarvis-rev-stripe-cs_123' },
      projectId: { type: 'string', example: 'proj-1' },
      source: { type: 'string', enum: ['stripe', 'wise', 'nowpayments', 'deposit', 'withdrawal', 'trade_pnl'] },
      externalId: { type: 'string', example: 'cs_123' },
      customer: { type: 'string', example: 'buyer@example.com' },
      amountCents: { type: 'integer', example: 4900 },
      feeCents: { type: 'integer', example: 150 },
      netCents: { type: 'integer', example: 4750 },
      currency: { type: 'string', example: 'USD' },
      status: { type: 'string', enum: ['paid', 'withdrawn', 'loss', 'pending'] },
      occurredAt: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'projectId', 'source', 'externalId', 'amountCents', 'currency', 'status', 'occurredAt'],
  },
  TradingSnapshot: {
    type: 'object',
    properties: {
      accountId: { type: 'string' },
      accountLabel: { type: 'string' },
      capturedAt: { type: 'string', format: 'date-time' },
      accountValueUsd: { type: 'number', format: 'double' },
      buyingPowerUsd: { type: 'number', format: 'double' },
      cashUsd: { type: 'number', format: 'double' },
      dayPnlUsd: { type: 'number', format: 'double' },
      totalPnlUsd: { type: 'number', format: 'double' },
      source: { type: 'string' },
    },
    required: ['accountId', 'accountLabel', 'capturedAt', 'accountValueUsd', 'buyingPowerUsd', 'cashUsd', 'dayPnlUsd', 'totalPnlUsd', 'source'],
  },
  TradingPosition: {
    type: 'object',
    properties: {
      symbol: { type: 'string' },
      quantity: { type: 'number', format: 'double' },
      avgCostUsd: { type: 'number', format: 'double' },
      marketValueUsd: { type: 'number', format: 'double' },
      unrealizedPnlUsd: { type: 'number', format: 'double' },
    },
    required: ['symbol', 'quantity', 'avgCostUsd', 'marketValueUsd', 'unrealizedPnlUsd'],
  },
  AccountInfo: {
    type: 'object',
    properties: {
      account_id: { type: 'string' },
      account_label: { type: 'string' },
      account_balance: { type: 'number', format: 'double' },
      account_equity: { type: 'number', format: 'double' },
      margin_free: { type: 'number', format: 'double' },
      positions: { type: 'array', items: { type: 'object' } },
    },
    required: ['account_id', 'account_label', 'account_balance', 'account_equity', 'margin_free'],
  },
  Pagination: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
  },
};

// Build the complete OpenAPI spec
export function generateOpenAPISpec(): OpenAPISpec {
  return {
    openapi: '3.1.0',
    info: {
      title: 'FounderOS API',
      version: process.env.npm_package_version || '1.0.0',
      description: 'FounderOS — Personal operating system for a one-person business. Live web command center that runs your company as a set of AI-assisted departments.',
      contact: { name: 'FounderOS', url: 'https://founderos.io' },
    },
    servers: [
      { url: 'http://localhost:4100', description: 'Local development' },
      { url: 'https://api.founderos.io', description: 'Production' },
    ],
    paths: {
      // Health
      '/api/health': {
        get: {
          summary: 'Health check',
          description: 'Liveness/readiness probe. Use ?full=1 for comprehensive report.',
          operationId: 'healthCheck',
          tags: ['Health'],
          parameters: [
            { name: 'full', in: 'query', schema: { type: 'boolean' }, description: 'Return full health report' },
            { name: 'version', in: 'query', schema: { type: 'boolean' }, description: 'Include version info' },
          ],
          responses: {
            '200': { description: 'Healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthReport' } } } },
            '503': { description: 'Unhealthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // Jarvis Revenue
      '/api/jarvis/revenue/sync': {
        post: {
          summary: 'Sync revenue from all payment providers',
          description: 'Syncs Stripe, Wise, NOWPayments. Idempotent by external ID.',
          operationId: 'syncRevenue',
          tags: ['Jarvis', 'Revenue'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projectId: { type: 'string' },
                    limit: { type: 'integer', default: 100 },
                    maxPages: { type: 'integer', default: 1 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Sync result', content: { 'application/json': { schema: { $ref: '#/components/schemas/RevenueSyncResult' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // Jarvis Funding
      '/api/jarvis/funding/deposit': {
        post: {
          summary: 'Record a deposit',
          description: 'Records a deposit into the ledger (source: deposit). Auth required.',
          operationId: 'recordDeposit',
          tags: ['Jarvis', 'Funding'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId', 'amountCents', 'reference'],
                  properties: {
                    projectId: { type: 'string' },
                    amountCents: { type: 'integer', minimum: 1 },
                    currency: { type: 'string', default: 'USD' },
                    reference: { type: 'string' },
                    note: { type: 'string' },
                    feeCents: { type: 'integer', default: 0 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Deposit recorded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Revenue' } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/jarvis/funding/withdraw': {
        post: {
          summary: 'Record a withdrawal',
          description: 'Records a withdrawal (negative amount). Balance checked unless JARVIS_ALLOW_NEGATIVE_WITHDRAWALS=1.',
          operationId: 'recordWithdrawal',
          tags: ['Jarvis', 'Funding'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId', 'amountCents', 'reference'],
                  properties: {
                    projectId: { type: 'string' },
                    amountCents: { type: 'integer', minimum: 1 },
                    currency: { type: 'string', default: 'USD' },
                    reference: { type: 'string' },
                    note: { type: 'string' },
                    feeCents: { type: 'integer', default: 0 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Withdrawal recorded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Revenue' } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '409': { description: 'Insufficient funds', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/jarvis/funding/webhook': {
        post: {
          summary: 'Trade P&L webhook',
          description: 'Records closed trade P&L. Supports single trade or batch. Idempotent by reference.',
          operationId: 'recordTradePnl',
          tags: ['Jarvis', 'Funding'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/TradePnlRequest' },
                    { type: 'object', properties: { trades: { type: 'array', items: { $ref: '#/components/schemas/TradePnlRequest' } } } },
                  ],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Trade(s) recorded', content: { 'application/json': { schema: { $ref: '#/components/schemas/TradePnlResponse' } } } },
            '207': { description: 'Partial success', content: { 'application/json': { schema: { $ref: '#/components/schemas/TradePnlResponse' } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/jarvis/funding/ledger': {
        get: {
          summary: 'Get funding ledger',
          description: 'Paginated ledger entries with optional source filter.',
          operationId: 'getLedger',
          tags: ['Jarvis', 'Funding'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'projectId', in: 'query', schema: { type: 'string' } },
            { name: 'source', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { description: 'Ledger entries', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, count: { type: 'integer' }, ledger: { type: 'array', items: { $ref: '#/components/schemas/Revenue' } } } } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/jarvis/funding/reconcile': {
        get: {
          summary: 'Reconcile project ledger',
          description: 'Returns gross, fees, net, and per-source breakdown.',
          operationId: 'reconcileProject',
          tags: ['Jarvis', 'Funding'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'projectId', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Reconciliation', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reconciliation' } } } },
            '400': { description: 'Missing projectId', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/jarvis/funding/export': {
        get: {
          summary: 'Export ledger as CSV',
          description: 'Downloads CSV with gross/fees/net per row plus TOTALS row.',
          operationId: 'exportLedger',
          tags: ['Jarvis', 'Funding'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'projectId', in: 'query', schema: { type: 'string' } },
            { name: 'source', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // Finances Bot Integration
      '/api/finances/bot-sync': {
        post: {
          summary: 'Bot sync - account snapshot + trades',
          description: 'Accepts account snapshot and closed trades from Loopader bot. Records snapshot to trading tables and trades as trade_pnl.',
          operationId: 'botSync',
          tags: ['Finances', 'Bot'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    source: { type: 'string', example: 'loopader' },
                    projectId: { type: 'string' },
                    account: { $ref: '#/components/schemas/AccountInfo' },
                    trades: { type: 'array', items: { $ref: '#/components/schemas/TradePnlRequest' } },
                  },
                  required: ['source'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Synced', content: { 'application/json': { schema: { $ref: '#/components/schemas/BotSyncResponse' } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/finances/transfer': {
        post: {
          summary: 'Deposit/withdrawal transfer',
          description: 'Records deposit or withdrawal. Accepts both FounderOS and Loopader CLI formats.',
          operationId: 'transferFunds',
          tags: ['Finances', 'Bot'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['deposit', 'withdrawal', 'deposit', 'withdraw'] },
                    projectId: { type: 'string' },
                    amountCents: { type: 'integer' },
                    amount: { type: 'number', description: 'Loopader format: amount in dollars' },
                    currency: { type: 'string', default: 'USD' },
                    reference: { type: 'string' },
                    note: { type: 'string' },
                    feeCents: { type: 'integer', default: 0 },
                    from: { type: 'string', enum: ['loopader', 'founderos'] },
                    to: { type: 'string', enum: ['loopader', 'founderos'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Transfer recorded', content: { 'application/json': { schema: { $ref: '#/components/schemas/TransferResponse' } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '409': { description: 'Insufficient funds', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // Trading
      '/api/trading/snapshot': {
        post: {
          summary: 'Record trading snapshot',
          description: 'Records account snapshot and positions. First real push retires demo data.',
          operationId: 'recordTradingSnapshot',
          tags: ['Trading'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['snapshot'],
                  properties: {
                    snapshot: { $ref: '#/components/schemas/TradingSnapshot' },
                    positions: { type: 'array', items: { $ref: '#/components/schemas/TradingPosition' }, maxItems: 200 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Snapshot recorded', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, positions: { type: 'integer' }, evicted: { type: 'integer', nullable: true } } } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/trading': {
        get: {
          summary: 'Get trading dashboard data',
          description: 'Returns all accounts, positions, history, activity, analysis, orders, and connector status.',
          operationId: 'getTradingDashboard',
          tags: ['Trading'],
          responses: {
            '200': { description: 'Trading dashboard payload', content: { 'application/json': { schema: { $ref: '#/components/schemas/TradingPayload' } } } },
          },
        },
      },

      // Jarvis Project Management
      '/api/jarvis/projects': {
        get: {
          summary: 'List Jarvis projects',
          operationId: 'listProjects',
          tags: ['Jarvis', 'Projects'],
          responses: {
            '200': { description: 'Project list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/JarvisProject' } } } } },
          },
        },
        post: {
          summary: 'Create Jarvis project',
          operationId: 'createProject',
          tags: ['Jarvis', 'Projects'],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/JarvisProjectInput' } } },
          },
          responses: {
            '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/JarvisProject' } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      '/api/jarvis/projects/{id}': {
        get: {
          summary: 'Get Jarvis project',
          operationId: 'getProject',
          tags: ['Jarvis', 'Projects'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Project', content: { 'application/json': { schema: { $ref: '#/components/schemas/JarvisProject' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          summary: 'Delete Jarvis project',
          operationId: 'deleteProject',
          tags: ['Jarvis', 'Projects'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // Jarvis Systems
      '/api/jarvis/systems': {
        get: {
          summary: 'List system connectors with live probe status',
          operationId: 'listSystems',
          tags: ['Jarvis', 'Systems'],
          responses: {
            '200': { description: 'Systems status', content: { 'application/json': { schema: { $ref: '#/components/schemas/SystemsStatus' } } } },
          },
        },
      },

      '/api/jarvis/systems/{id}': {
        post: {
          summary: 'Probe a specific system',
          operationId: 'probeSystem',
          tags: ['Jarvis', 'Systems'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Probe result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProbeResult' } } } },
          },
        },
      },

      // Jarvis Actions
      '/api/jarvis/actions': {
        get: {
          summary: 'List pending actions',
          operationId: 'listActions',
          tags: ['Jarvis', 'Actions'],
          responses: {
            '200': { description: 'Action list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/JarvisAction' } } } } },
          },
        },
      },

      '/api/jarvis/actions/{id}/decide': {
        post: {
          summary: 'Decide on a pending action',
          operationId: 'decideAction',
          tags: ['Jarvis', 'Actions'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['approved', 'rejected', 'deferred'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Decision recorded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // Jarvis Autopilot
      '/api/jarvis/autopilot': {
        get: {
          summary: 'Get autopilot status',
          operationId: 'getAutopilot',
          tags: ['Jarvis', 'Autopilot'],
          responses: {
            '200': { description: 'Autopilot status', content: { 'application/json': { schema: { $ref: '#/components/schemas/AutopilotStatus' } } } },
          },
        },
        post: {
          summary: 'Set autopilot mode',
          operationId: 'setAutopilot',
          tags: ['Jarvis', 'Autopilot'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['mode'],
                  properties: {
                    mode: { type: 'string', enum: ['observe', 'assisted', 'autopilot'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Mode updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AutopilotStatus' } } } },
            '400': { description: 'Invalid mode', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // Jarvis Memory
      '/api/jarvis/memory': {
        get: {
          summary: 'Get Jarvis memory',
          operationId: 'getMemory',
          tags: ['Jarvis', 'Memory'],
          responses: {
            '200': { description: 'Memory content', content: { 'application/json': { schema: { type: 'string' } } } },
          },
        },
        post: {
          summary: 'Update Jarvis memory',
          operationId: 'updateMemory',
          tags: ['Jarvis', 'Memory'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
              },
            },
          },
          responses: {
            '200': { description: 'Memory updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
          },
        },
      },
    },

    components: {
      schemas: {
        ...commonSchemas,
        HealthReport: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' },
            uptimeMs: { type: 'integer' },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                  latencyMs: { type: 'integer' },
                  details: { type: 'object' },
                  error: { type: 'string' },
                },
                required: ['name', 'status'],
              },
            },
          },
          required: ['status', 'timestamp', 'version', 'uptimeMs', 'checks'],
        },
        RevenueSyncResult: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            synced: { type: 'integer' },
            scanned: { type: 'integer' },
            summary: { type: 'string' },
          },
        },
        TradePnlRequest: {
          type: 'object',
          required: ['projectId', 'amountCents', 'reference'],
          properties: {
            projectId: { type: 'string' },
            amountCents: { type: 'integer' },
            currency: { type: 'string', default: 'USD' },
            reference: { type: 'string' },
            symbol: { type: 'string' },
            note: { type: 'string' },
            feeCents: { type: 'integer', default: 0 },
          },
        },
        TradePnlResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            recorded: { type: 'integer' },
            accepted: { type: 'integer' },
            rejected: { type: 'integer' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean' },
                  reference: { type: 'string' },
                  error: { type: 'string' },
                  revenue: { $ref: '#/components/schemas/Revenue' },
                },
              },
            },
          },
        },
        Reconciliation: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            grossCents: { type: 'integer' },
            feeCents: { type: 'integer' },
            netCents: { type: 'integer' },
            count: { type: 'integer' },
            bySource: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  gross: { type: 'integer' },
                  fees: { type: 'integer' },
                  net: { type: 'integer' },
                  count: { type: 'integer' },
                },
              },
            },
          },
        },
        BotSyncResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            success: { type: 'boolean' },
            source: { type: 'string' },
            snapshot: { type: 'boolean' },
            account: { type: 'object', nullable: true },
            trades: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean' },
                  reference: { type: 'string' },
                  error: { type: 'string' },
                },
              },
            },
          },
        },
        TransferResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            success: { type: 'boolean' },
            transfer: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                from: { type: 'string' },
                to: { type: 'string' },
                amount: { type: 'number' },
                amountCents: { type: 'integer' },
                netCents: { type: 'integer' },
                currency: { type: 'string' },
                status: { type: 'string' },
                reference: { type: 'string' },
                occurredAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        TradingPayload: {
          type: 'object',
          properties: {
            accounts: { type: 'array', items: { $ref: '#/components/schemas/TradingSnapshot' } },
            history: { type: 'object', additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/TradingSnapshot' } } },
            snapshot: { $ref: '#/components/schemas/TradingSnapshot', nullable: true },
            positions: { type: 'array', items: { $ref: '#/components/schemas/TradingPosition' } },
            activity: { type: 'array', items: { type: 'object' } },
            analysis: { type: 'object', nullable: true },
            openOrders: { type: 'array', items: { type: 'object' } },
            status: { type: 'string' },
            source: { type: 'string', nullable: true },
            phantom: { type: 'object', nullable: true },
            at: { type: 'string', format: 'date-time' },
          },
        },
        JarvisProject: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            repo: { type: 'string' },
            branch: { type: 'string' },
            deployUrl: { type: 'string' },
            healthUrl: { type: 'string' },
            checkoutUrl: { type: 'string' },
            stripePriceId: { type: 'string' },
            deployHookEnv: { type: 'string' },
            localPath: { type: 'string' },
            verifyCommand: { type: 'string' },
            priceCents: { type: 'integer' },
            currency: { type: 'string' },
            status: { type: 'string' },
            autonomy: { type: 'string', enum: ['observe', 'assisted', 'autopilot'] },
            health: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            lastRunAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        JarvisProjectInput: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            repo: { type: 'string' },
            branch: { type: 'string', default: 'main' },
            deployUrl: { type: 'string' },
            healthUrl: { type: 'string' },
            checkoutUrl: { type: 'string' },
            stripePriceId: { type: 'string' },
            deployHookEnv: { type: 'string', default: 'VERCEL_DEPLOY_HOOK_URL' },
            localPath: { type: 'string' },
            verifyCommand: { type: 'string' },
            priceCents: { type: 'integer', default: 0 },
            currency: { type: 'string', default: 'USD' },
            autonomy: { type: 'string', enum: ['observe', 'assisted', 'autopilot'], default: 'assisted' },
          },
        },
        SystemsStatus: {
          type: 'object',
          properties: {
            systems: { type: 'array', items: { $ref: '#/components/schemas/SystemStatus' } },
            counts: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                connected: { type: 'integer' },
                notConfigured: { type: 'integer' },
                error: { type: 'integer' },
                selfServiceConnected: { type: 'integer' },
              },
            },
            lastProbeAt: { type: 'string', format: 'date-time', nullable: true },
            newlyConnected: { type: 'array', items: { type: 'string' } },
            lost: { type: 'array', items: { type: 'string' } },
            needsKeys: { type: 'array', items: { type: 'string' } },
          },
        },
        SystemStatus: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['connected', 'not_configured', 'error', 'self_service'] },
            lastProbeAt: { type: 'string', format: 'date-time', nullable: true },
            details: { type: 'object' },
          },
        },
        ProbeResult: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            status: { type: 'string' },
            latencyMs: { type: 'integer' },
            details: { type: 'object' },
            error: { type: 'string', nullable: true },
          },
        },
        JarvisAction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            runId: { type: 'string', nullable: true },
            kind: { type: 'string' },
            title: { type: 'string' },
            risk: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'deferred', 'executing', 'completed', 'failed'] },
            payload: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' },
            decidedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        AutopilotStatus: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['observe', 'assisted', 'autopilot'] },
            killSwitch: { type: 'boolean' },
          },
        },
      },
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JARVIS_LOCAL_INGEST_TOKEN for bot-to-FounderOS communication',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-jarvis-token',
          description: 'Alternative token header for bot communication',
        },
      },
    },
    tags: [
      { name: 'Health', description: 'System health and liveness checks' },
      { name: 'Jarvis', description: 'Jarvis autonomous agent management' },
      { name: 'Finances', description: 'Financial operations and bot integration' },
      { name: 'Trading', description: 'Trading dashboard and MT5 integration' },
      { name: 'Bot', description: 'Loopader bot integration endpoints' },
    ],
    security: [{ BearerAuth: [] }],
  };
}

// Generate and export the spec
export const openapiSpec = generateOpenAPISpec();