/**
 * Core data-shape types shared by adapters, the variable engine, and widgets.
 *
 * These mirror the columns of our raw multi-cloud cost export (see
 * public/data/costs.csv). Note this is NOT the FOCUS schema — FOCUS
 * normalization happens in the real pipeline later. When it does, only the
 * adapter layer should need to change; everything above it consumes the
 * normalized `DataResult` shape below.
 */

/** Dimension columns of the cost export. */
export const COST_DIMENSION_FIELDS = [
  "Provider",
  "service_name",
  "application_service",
  "Environment",
  "Team",
  "Account_ID",
] as const;

export type CostDimensionField = (typeof COST_DIMENSION_FIELDS)[number];

/**
 * Dimension columns of the business unit metrics export (after the adapter
 * maps Service_Name -> application_service and enriches rows with the
 * owning Team, looked up from the cost data, so drill-down filters apply to
 * both datasets).
 */
export const TRANSACTION_DIMENSION_FIELDS = [
  "application_service",
  "Environment",
  "Team",
  "identified_transaction",
] as const;

export type TransactionDimensionField = (typeof TRANSACTION_DIMENSION_FIELDS)[number];

/** Any dimension a query may group or filter by. */
export type DimensionField = CostDimensionField | TransactionDimensionField;

/** A single parsed row of the raw cost export, with Cost/Date pre-parsed. */
export type CostRow = Record<CostDimensionField, string> & {
  /** Cost in dollars for one hour. */
  cost: number;
  /** Timestamp (epoch ms, UTC) of the hour the cost applies to. */
  ts: number;
};

/**
 * A single parsed row of the business unit metrics export
 * (Time_Stamp / Environment / Service_Name / identified_transaction /
 * Successful_Transactions), normalized to the shared dimension names.
 */
export type TransactionRow = Record<TransactionDimensionField, string> & {
  /** Successful transactions counted in one hour. */
  transactions: number;
  /** Timestamp (epoch ms, UTC) of the hour. */
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
