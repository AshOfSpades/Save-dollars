/**
 * DataSourceAdapter — THE contract between the dashboard and its data.
 *
 * Everything above this interface (widgets, layout, variable engine, drill-
 * down state) is source-agnostic: it builds a `WidgetQuery`, hands it to the
 * adapter together with the current variable values, and renders the
 * normalized `DataResult` that comes back.
 *
 * The prototype ships a `CsvAdapter` that aggregates a local CSV client-side.
 * The real pipeline will replace it with an `ApiAdapter` (or one adapter per
 * upstream: AWS Cost Explorer, Azure Cost Management, Datadog usage, Mongo
 * Atlas billing — normalized to FOCUS). Swapping adapters must require zero
 * changes to widgets, layout, or variable logic.
 */

import type { DataResult, DimensionField } from "../types/data";
import type { DateRangePresetId } from "../engine/dateRanges";

/**
 * Equality filter on a dimension column. `value` may be a literal
 * ("payments") or a variable reference ("{{environment}}") that the variable
 * engine resolves at fetch time. A filter whose resolved value is the
 * ALL_VALUE sentinel (see engine/variables.ts) is dropped, i.e. "no filter".
 *
 * Only equality is supported for now; extend with an `op` field when a real
 * source needs it.
 */
export interface QueryFilter {
  field: DimensionField;
  value: string;
}

/**
 * The time window a query covers. One of:
 * - a named preset, resolved relative to "now"  -> { preset: "mtd" }
 * - an explicit ISO-8601 window                  -> { start, end }
 * - a variable reference                         -> "{{dateRange}}"
 *   (the referenced variable holds a preset id)
 */
export type DateRangeSpec =
  | { preset: DateRangePresetId }
  | { start: string; end: string }
  | string;

/**
 * Declarative widget query. This is what dashboard configs contain, and it is
 * deliberately tiny: a metric, optional grouping, optional time bucketing,
 * filters and a date range. Any string value may contain `{{variable}}`
 * placeholders.
 */
export interface WidgetQuery {
  /**
   * Aggregation to compute. Only "sum(Cost)" is meaningful for the cost
   * export today; typed as string so configs stay forward-compatible.
   */
  metric: string;
  /** Dimensions to group by. Omit for a single grand-total row. */
  groupBy?: DimensionField[];
  /**
   * Time bucketing. "day" sums the hourly Cost rows into calendar days (UTC)
   * and adds a `date` column — required for daily trend widgets since the
   * raw export is hourly. Default: "total" (no time bucketing).
   */
  granularity?: "day" | "total";
  /** Filters ANDed together. Values may reference variables. */
  filters?: QueryFilter[];
  /** Time window. Omit to query all available data. */
  dateRange?: DateRangeSpec;
}

/** Current UI variable values, keyed by variable name (e.g. environment). */
export type VariableValues = Record<string, string>;

export interface DataSourceAdapter {
  /**
   * Execute a widget query and return a normalized table.
   *
   * `variables` are the current UI control values; the adapter resolves any
   * `{{placeholders}}` in the query via the shared variable engine before
   * executing. Implementations must be side-effect free and safe to call
   * concurrently.
   */
  fetch(query: WidgetQuery, variables: VariableValues): Promise<DataResult>;

  /**
   * Distinct values of a dimension across the data source, used to populate
   * variable dropdowns (e.g. the Environment select). An ApiAdapter would
   * back this with the source's metadata/tag-values endpoint.
   */
  distinctValues(field: DimensionField): Promise<string[]>;
}
