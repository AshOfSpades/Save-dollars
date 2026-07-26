/**
 * Dashboard config schema.
 *
 * A dashboard is a plain JSON-serializable document: variables (the controls
 * in the VariableBar), a grid definition, and a list of widgets. The shell
 * renders whatever the config describes — adding a widget or a whole new
 * dashboard means writing config, not components.
 *
 * This schema is the second long-lived contract (next to DataSourceAdapter):
 * when the real pipeline lands, configs move to storage/API but keep this
 * shape.
 */

import type { DateRangePresetId } from "../engine/dateRanges";
import type { QueryFilter, WidgetQuery } from "../adapters/DataSourceAdapter";
import type { DimensionField } from "../types/data";

/**
 * Who a widget is for. The technical-detail toggle in the shell controls
 * this: `"technical"` widgets only render while the toggle is on, so a
 * single config serves both Finance/managers and engineers.
 */
export type WidgetAudience = "all" | "technical";

/** Grid position/size in react-grid-layout units (12-column grid). */
export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A VariableBar control. Every variable exposes its current value to widget
 * queries as `{{name}}`.
 */
export type VariableConfig =
  | {
      /** Preset-based date range picker. */
      type: "dateRangePreset";
      name: string;
      label: string;
      presets: DateRangePresetId[];
      default: DateRangePresetId;
    }
  | {
      /**
       * Dropdown over the distinct values of a dimension, populated from the
       * data source at runtime (never hardcoded). When `includeAllOption` is
       * set, an "All" option is added whose value is the ALL_VALUE sentinel —
       * filters resolving to it are dropped by the variable engine.
       */
      type: "dimensionSelect";
      name: string;
      label: string;
      field: DimensionField;
      includeAllOption: boolean;
      default: string;
    };

export interface WidgetConfig {
  /** Unique within the dashboard; used as the grid item key. */
  id: string;
  type: "lineChart" | "barChart" | "bigNumber" | "table";
  title: string;
  subtitle?: string;
  /** See WidgetAudience — "technical" widgets are gated by the detail toggle. */
  audience: WidgetAudience;
  layout: WidgetLayout;
  /**
   * Restrict the widget to a range of drill-down depths (depth = number of
   * breadcrumb crumbs after the root; landing view = 0). Omitted bounds are
   * unbounded. E.g. the by-Team bar is `{ maxDepth: 0 }` (landing only) and
   * the by-application_service bar is `{ minDepth: 1, maxDepth: 1 }`.
   */
  visibleWhen?: { minDepth?: number; maxDepth?: number };
  /**
   * Makes chart segments clickable: clicking the segment for value V appends
   * a breadcrumb `{ label: V, filter: { field, value: V } }`, which then
   * filters every widget on the dashboard.
   */
  drilldown?: { field: DimensionField };
  /**
   * Where the widget's data comes from. `query` may reference variables with
   * `{{name}}`; active breadcrumb filters are merged in at fetch time.
   */
  dataSource: { query: WidgetQuery };
  /** Presentation options, interpreted per widget type. */
  options?: WidgetOptions;
}

export interface WidgetOptions {
  /**
   * bigNumber: render a budget progress bar against this static dollar
   * target (real budget objects come with the actual pipeline).
   */
  budget?: number;
  /** bigNumber: label shown next to the budget bar. */
  budgetLabel?: string;
  /**
   * bigNumber: show a trend chip comparing the trailing N days against the
   * N days before that (same filters/drill-down applied). Spend going up
   * renders as a negative (danger-colored) trend.
   */
  trendWindowDays?: number;
  /** Charts: which accent color to use for the series. Default "primary". */
  color?: "primary" | "secondary";
}

export interface DashboardConfig {
  id: string;
  title: string;
  subtitle?: string;
  /** Label of the root breadcrumb, e.g. "Total spend". */
  rootCrumbLabel: string;
  variables: VariableConfig[];
  grid: { cols: number; rowHeight: number };
  widgets: WidgetConfig[];
}

/** Breadcrumb crumb: the root crumb has no filter. */
export interface Crumb {
  label: string;
  filter?: QueryFilter;
}
