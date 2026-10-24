/**
 * Date helpers. Everything is UTC-anchored and string-based (`yyyy-mm-dd`).
 *
 * Deliberately avoids the local-timezone pitfalls of `new Date("2026-03-31")`
 * by always constructing dates at UTC midnight and comparing date-only strings.
 */

import type { IsoDate, IsoDateTime } from './types.js';

export const MS_PER_DAY = 86_400_000;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parses `yyyy-mm-dd` (or an ISO string) into a UTC-midnight Date. */
export function parseDate(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(input).trim());
  if (!m) throw new Error(`Invalid date: ${input} (expected yyyy-mm-dd)`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Formats a Date as `yyyy-mm-dd` in UTC. */
export function formatDate(d: Date): IsoDate {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function isoNow(): IsoDateTime {
  return new Date().toISOString();
}

export function today(): IsoDate {
  return formatDate(new Date());
}

export function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

export function addDays(date: string | Date, days: number): IsoDate {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

/** Calendar-month arithmetic that clamps to the end of the month. */
export function addMonths(date: string | Date, months: number): IsoDate {
  const d = parseDate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return formatDate(d);
}

export function addYears(date: string | Date, years: number): IsoDate {
  return addMonths(date, years * 12);
}

/** Whole days from `a` to `b`. Positive means `b` is later. */
export function daysBetween(a: string | Date, b: string | Date): number {
  const da = parseDate(a).getTime();
  const db = parseDate(b).getTime();
  return Math.round((db - da) / MS_PER_DAY);
}

export function addBusinessDays(date: string | Date, days: number): IsoDate {
  const d = parseDate(date);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return formatDate(d);
}

export function isWeekend(date: string | Date): boolean {
  const dow = parseDate(date).getUTCDay();
  return dow === 0 || dow === 6;
}

export function startOfDay(date: string | Date): Date {
  return parseDate(date);
}

export function monthKey(date: string | Date): string {
  const d = parseDate(date);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function startOfMonth(date: string | Date): IsoDate {
  const d = parseDate(date);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

export function endOfMonth(date: string | Date): IsoDate {
  const d = parseDate(date);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(lastDay)}`;
}

export function endOfTaxYear(date: string | Date): IsoDate {
  const d = parseDate(date);
  const y = d.getUTCFullYear();
  // UK tax year ends 5 April.
  return `${y}-04-05`;
}

export function taxYearLabel(date: string | Date): string {
  const d = parseDate(date);
  const y = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  // Tax year runs 6 April to 5 April.
  if (month > 4 || (month === 4 && day >= 6)) {
    return `${y}-${y + 1}`;
  }
  return `${y - 1}-${y}`;
}

export function formatHumanDate(date: string | Date): string {
  const d = parseDate(date);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
