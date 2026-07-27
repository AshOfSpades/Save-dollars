/** Shared display formatting helpers. */

const currencyFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const currencyPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatCurrency(n: number): string {
  return currencyFull.format(n);
}

/** Short form for axis ticks and dense tables, e.g. "$1.2K". */
export function formatCurrencyCompact(n: number): string {
  return currencyCompact.format(n);
}

export function formatCurrencyPrecise(n: number): string {
  return currencyPrecise.format(n);
}

const countFull = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const countCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Sub-cent-capable, for unit economics: $0.0147, $2.41, ... */
const currencyUnit = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 3,
});

/**
 * How a widget's `value` column should be displayed. Configured per widget
 * via `options.format`; defaults to "currency".
 */
export type ValueFormat = "currency" | "unitCurrency" | "count";

/** Full-precision form, for tooltips, tables and big numbers. */
export function formatValue(n: number, format: ValueFormat = "currency"): string {
  switch (format) {
    case "currency":
      return currencyPrecise.format(n);
    case "unitCurrency":
      return n >= 100 ? currencyPrecise.format(n) : currencyUnit.format(n);
    case "count":
      return countFull.format(n);
  }
}

/** Short form, for axis ticks. */
export function formatValueCompact(n: number, format: ValueFormat = "currency"): string {
  switch (format) {
    case "currency":
      return currencyCompact.format(n);
    case "unitCurrency":
      return n >= 100 ? currencyCompact.format(n) : currencyUnit.format(n);
    case "count":
      return countCompact.format(n);
  }
}

/** "+12.3%" / "-4.5%" */
export function formatPercentDelta(fraction: number): string {
  const pct = fraction * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "2026-07-18" -> "Jul 18" */
export function formatDay(isoDay: string): string {
  return dayFormat.format(new Date(`${isoDay}T00:00:00Z`));
}
