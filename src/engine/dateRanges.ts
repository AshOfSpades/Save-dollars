/**
 * Date range presets available to the dashboard's date range variable.
 *
 * Presets resolve to concrete [start, end) epoch-ms windows at fetch time.
 * All calendar math is UTC, matching the timestamps in the cost export.
 */

const DAY_MS = 86_400_000;

export type DateRangePresetId = "last7d" | "last14d" | "mtd";

export interface ResolvedDateRange {
  /** Inclusive start, epoch ms. */
  start: number;
  /** Exclusive end, epoch ms. */
  end: number;
}

export const DATE_RANGE_PRESETS: Record<
  DateRangePresetId,
  { label: string; resolve: (nowMs: number) => ResolvedDateRange }
> = {
  last7d: {
    label: "Last 7 days",
    resolve: (now) => ({ start: now - 7 * DAY_MS, end: now }),
  },
  last14d: {
    label: "Last 14 days",
    resolve: (now) => ({ start: now - 14 * DAY_MS, end: now }),
  },
  mtd: {
    label: "Month to date",
    resolve: (now) => {
      const d = new Date(now);
      return { start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), end: now };
    },
  },
};

export function isDateRangePresetId(value: string): value is DateRangePresetId {
  return value in DATE_RANGE_PRESETS;
}
