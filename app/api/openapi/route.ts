/**
 * OpenAPI 3.1 Specification Endpoint
 * 
 * GET /api/openapi          — JSON spec
 * GET /api/openapi?format=yaml  — YAML spec
 * GET /api/openapi?pretty=1 — Pretty-printed JSON
 */

import { NextResponse } from 'next/server';
import { openapiSpec } from '@/lib/jarvis/openapi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format');
  const pretty = searchParams.get('pretty') === '1';

  const spec = openapiSpec;

  if (format === 'yaml') {
    // Simple JSON to YAML conversion
    const yaml = jsonToYaml(spec);
    return new NextResponse(yaml, {
      headers: {
        'Content-Type': 'application/yaml',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'no-store',
      ...(pretty ? { 'X-Pretty-Print': '1' } : {}),
    },
  });
}

function jsonToYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (obj === null) return `${spaces}null`;
  if (obj === undefined) return `${spaces}null`;
  if (typeof obj === 'string') return `${spaces}"${obj}"`;
  if (typeof obj === 'number' || typeof obj === 'boolean') return `${spaces}${obj}`;
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${spaces}[]`;
    return obj.map(item => `${spaces}- ${jsonToYaml(item, 0).trimStart()}`).join('\n');
  }
  
  const keys = Object.keys(obj);
  if (keys.length === 0) return `${spaces}{}`;
  
  return keys.map(key => {
    const value = (obj as Record<string, unknown>)[key];
    const yamlValue = jsonToYaml(value, indent + 1);
    return `${spaces}${key}:${yamlValue.startsWith('\n') ? '' : ' '}${yamlValue.trimStart()}`;
  }).join('\n');
}