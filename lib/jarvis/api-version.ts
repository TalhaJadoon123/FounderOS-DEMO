/**
 * API Versioning Middleware
 * 
 * Handles version negotiation and deprecation warnings
 */

import { NextResponse } from 'next/server';

const SUPPORTED_VERSIONS = ['1', '2'];
const DEFAULT_VERSION = '1';
const DEPRECATED_VERSIONS = new Set<string>();

export interface VersionedRequest extends Request {
  apiVersion: string;
}

export function getApiVersion(headers: Headers): string {
  const version = headers.get('x-api-version') || headers.get('x-jarvis-api-version') || DEFAULT_VERSION;
  return SUPPORTED_VERSIONS.includes(version) ? version : DEFAULT_VERSION;
}

export function isVersionDeprecated(version: string): boolean {
  return DEPRECATED_VERSIONS.has(version);
}

export function versionMiddleware(
  handler: (req: VersionedRequest) => Promise<NextResponse>
) {
  return async (req: Request): Promise<NextResponse> => {
    const version = getApiVersion(req.headers);
    
    // Add version to request for downstream use
    const versionedReq = req as VersionedRequest;
    versionedReq.apiVersion = version;

    const response = await handler(versionedReq);
    
    // Add version headers
    response.headers.set('x-api-version', version);
    response.headers.set('x-supported-versions', SUPPORTED_VERSIONS.join(', '));
    
    if (isVersionDeprecated(version)) {
      response.headers.set('x-api-deprecated', 'true');
      response.headers.set('x-api-deprecation-date', '2026-12-31');
    }
    
    return response;
  };
}

export function requireVersion(minVersion: string) {
  return (req: VersionedRequest): NextResponse | null => {
    const version = req.apiVersion;
    const min = SUPPORTED_VERSIONS.indexOf(minVersion);
    const current = SUPPORTED_VERSIONS.indexOf(version);
    
    if (current < min) {
      return NextResponse.json(
        { 
          ok: false, 
          error: `API version ${version} is no longer supported. Minimum required: ${minVersion}`,
          supportedVersions: SUPPORTED_VERSIONS,
        },
        { status: 426 }
      );
    }
    return null;
  };
}