/**
 * Core data-shape types shared by adapters, the variable engine, and widgets.
 *
 * These mirror the columns of our raw multi-cloud cost export (see
 * public/data/costs.csv). Note this is NOT the FOCUS schema — FOCUS
 * normalization happens in the real pipeline later. When it does, only the
 * adapter layer should need to change; everything above it consumes the
 * normalized `DataResult` shape below.
 */

/** Dimension columns that queries may group or filter by. */
export const DIMENSION_FIELDS = [
  "Provider",
  "service_name",
  "application_service",
  "Environment",
  "Team",
  "Account_ID",
] as const;

export type DimensionField = (typeof DIMENSION_FIELDS)[number];

/** A single parsed row of the raw export, with Cost/Date pre-parsed. */
export type CostRow = Record<DimensionField, string> & {
  /** Cost in dollars for one hour. */
  cost: number;
  /** Timestamp (epoch ms, UTC) of the hour the cost applies to. */
  ts: number;
};

export interface ColumnMeta {
  name: string;
  type: "string" | "number" | "date";
}

/**
 * Normalized tabular result every adapter returns, regardless of source.
 * Widgets are written against this shape only — they never see CSV rows or
 * (later) raw API responses.
 *
 * Conventions:
 * - grouped dimensions keep their dimension name as the column name
 * - a daily-granularity result has a `date` column ("YYYY-MM-DD", UTC)
 * - the aggregated metric is always in a `value` column
 */
export interface DataResult {
  columns: ColumnMeta[];
  rows: Record<string, string | number>[];
}
