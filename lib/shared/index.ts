/**
 * Shared package index — re-export everything so consumers can do
 * `import { env, today, money, id } from '@/lib/shared'`.
 */

export { env, envBool, envInt, envList, envLoaded, findEnvFile, loadEnv, requireEnv, resolveFromRoot } from './env.js';
export {
  addBusinessDays,
  addDays,
  addMonths,
  addYears,
  daysBetween,
  endOfMonth,
  endOfTaxYear,
  formatDate,
  formatHumanDate,
  isoNow,
  monthKey,
  nowIso,
  parseDate,
  startOfDay,
  startOfMonth,
  taxYearLabel,
  today,
} from './dates.js';
export { amountsMatch, formatMoney, parseAmount, percent, round2, signed, sum } from './money.js';
export { fingerprint, id, shortCode, slug, token, uuid } from './ids.js';
export type { Direction, IsoDate, IsoDateTime, Json, Money } from './types.js';
