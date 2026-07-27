/**
 * Variable engine.
 *
 * Widget queries may reference UI variables with `{{name}}` placeholders
 * (e.g. a filter value of "{{environment}}", or a dateRange of
 * "{{dateRange}}"). This module:
 *
 * 1. extracts, once per widget at config load time, the set of variables a
 *    query depends on — so the dashboard only refetches widgets whose query
 *    actually uses a variable that changed;
 * 2. resolves a query against the current variable values into a concrete,
 *    placeholder-free `ResolvedQuery` that any adapter can execute.
 */

import type {
  DateRangeSpec,
  QueryFilter,
  WidgetQuery,
  VariableValues,
} from "../adapters/DataSourceAdapter";
import type { DimensionField } from "../types/data";
import {
  DATE_RANGE_PRESETS,
  isDateRangePresetId,
  type ResolvedDateRange,
} from "./dateRanges";

/**
 * Sentinel value meaning "no filter" for select-type variables (the "All
 * environments" option). Filters that resolve to this value are dropped.
 */
export const ALL_VALUE = "all";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** A fully resolved query: no placeholders, date range as epoch ms. */
export interface ResolvedQuery {
  metric: string;
  groupBy: DimensionField[];
  granularity: "day" | "total";
  filters: { field: DimensionField; value: string }[];
  /** null = no time constraint. */
  range: ResolvedDateRange | null;
}

/**
 * Names of all variables referenced anywhere in a query. Computed once per
 * widget when the config loads; the result drives selective refetching.
 */
export function extractVariableDeps(query: WidgetQuery): string[] {
  const names = new Set<string>();
  for (const match of JSON.stringify(query).matchAll(PLACEHOLDER_RE)) {
    names.add(match[1]);
  }
  return [...names];
}

function substitute(value: string, variables: VariableValues): string {
  return value.replace(PLACEHOLDER_RE, (_, name: string) => variables[name] ?? "");
}

function resolveDateRange(
  spec: DateRangeSpec | undefined,
  variables: VariableValues,
  nowMs: number
): ResolvedDateRange | null {
  if (spec === undefined) return null;
  if (typeof spec === "string") {
    const presetId = substitute(spec, variables);
    if (!isDateRangePresetId(presetId)) {
      throw new Error(`Unknown date range preset: "${presetId}"`);
    }
    return DATE_RANGE_PRESETS[presetId].resolve(nowMs);
  }
  if ("preset" in spec) {
    return DATE_RANGE_PRESETS[spec.preset].resolve(nowMs);
  }
  return { start: Date.parse(spec.start), end: Date.parse(spec.end) };
}

/**
 * Substitute variable placeholders and normalize a widget query into a
 * concrete `ResolvedQuery`.
 *
 * Filters whose resolved value is empty or ALL_VALUE are removed — this is
 * how "All environments" works without special-casing in adapters.
 */
export function resolveQuery(
  query: WidgetQuery,
  variables: VariableValues,
  nowMs: number = Date.now()
): ResolvedQuery {
  const filters: ResolvedQuery["filters"] = [];
  for (const f of query.filters ?? []) {
    const value = substitute(f.value, variables);
    if (value !== "" && value !== ALL_VALUE) {
      filters.push({ field: f.field, value });
    }
  }
  return {
    metric: query.metric,
    groupBy: query.groupBy ?? [],
    granularity: query.granularity ?? "total",
    filters,
    range: resolveDateRange(query.dateRange, variables, nowMs),
  };
}

/** Merge extra (drill-down) filters into a query without mutating it. */
export function withExtraFilters(query: WidgetQuery, extra: QueryFilter[]): WidgetQuery {
  if (extra.length === 0) return query;
  return { ...query, filters: [...(query.filters ?? []), ...extra] };
}
