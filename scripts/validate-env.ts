/**
 * Environment validation script.
 *
 * Runs at API boot to fail fast on missing/invalid required configuration.
 * Call `validateEnv()` early in server startup.
 */

import { env, envBool, envInt } from '@/lib/shared/env';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_IN_PRODUCTION = [
  'FOUNDER_OS_ACCESS_TOKEN',
];

const OPTIONAL_BUT_RECOMMENDED = [
  'STRIPE_SECRET_KEY',
  'RESEND_API_KEY',
  'SLACK_BOT_TOKEN',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SITE_URL',
];

export function validateEnv(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  for (const key of REQUIRED_IN_PRODUCTION) {
    const value = env(key);
    if (!value) {
      if (isProduction) {
        errors.push(`Required environment variable not set: ${key}`);
      } else {
        warnings.push(`Recommended for production: ${key} (currently unset)`);
      }
    }
  }

  for (const key of OPTIONAL_BUT_RECOMMENDED) {
    const value = env(key);
    if (!value) {
      warnings.push(`Optional but recommended: ${key} (currently unset)`);
    }
  }

  // Validate rate limit config
  const rateLimitMax = envInt('RATE_LIMIT_MAX', 100);
  const rateLimitWindow = envInt('RATE_LIMIT_WINDOW_MS', 60_000);
  if (rateLimitMax < 1) {
    errors.push('RATE_LIMIT_MAX must be a positive integer');
  }
  if (rateLimitWindow < 1000) {
    errors.push('RATE_LIMIT_WINDOW_MS must be at least 1000ms');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/** Run validation and print results. Returns true when ok. */
export function validateEnvOrExit(): boolean {
  const result = validateEnv();

  if (result.warnings.length > 0) {
    console.warn('\n⚠️  Environment warnings:');
    for (const w of result.warnings) console.warn(`  - ${w}`);
  }

  if (result.errors.length > 0) {
    console.error('\n❌ Environment errors:');
    for (const e of result.errors) console.error(`  - ${e}`);
    console.error('\nCopy .env.example to .env.local and fill in the missing values.');
    return false;
  }

  console.log('✅ Environment validated.');
  return true;
}
