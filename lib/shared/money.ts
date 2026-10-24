/**
 * Money helpers. All amounts are numbers in minor currency units (cents/pence).
 * Always round to 2 dp on output; never accumulate floating-point error.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sum(values: number[]): number {
  return round2(values.reduce((a, b) => a + b, 0));
}

/** Amount with direction sign applied. */
export function signed(amount: number, direction: 'in' | 'out'): number {
  return direction === 'out' ? -round2(amount) : round2(amount);
}

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parses the amount formats that appear in bank feeds:
 * `$1,234.50`, `(120.00)` (accountancy negative), `120.00-` (some exports).
 */
export function parseAmount(input: string | number): number {
  if (typeof input === 'number') return round2(input);

  let s = String(input).trim();
  if (!s) return 0;

  let negative = false;

  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (/^\(.*\)$/.test(s.trim())) {
    negative = true;
    s = s.trim().slice(1, -1);
  }

  s = s.replace(/[^0-9.]/g, '');
  if (!s) return 0;

  const parsed = Number(s);
  if (!Number.isFinite(parsed)) return 0;
  return round2(negative ? -parsed : parsed);
}

/** True when two amounts are equal to within a penny. */
export function amountsMatch(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return round2((part / whole) * 100);
}
