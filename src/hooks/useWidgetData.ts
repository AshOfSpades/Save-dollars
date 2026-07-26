/**
 * useWidgetData — resolves and executes a widget's query.
 *
 * Selective refetching: the set of variables a query references is computed
 * once per widget (extractVariableDeps); the fetch effect only re-runs when
 * one of THOSE variables changes, or when the breadcrumb trail (which applies
 * to every widget) changes. Unrelated variable changes don't refetch.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DataResult } from "../types/data";
import type { WidgetConfig } from "../config/schema";
import { extractVariableDeps, withExtraFilters } from "../engine/variables";
import { useDashboard } from "../state/DashboardContext";

const DAY_MS = 86_400_000;

export interface TrendInfo {
  /** Fractional change of current window vs previous (null if prev == 0). */
  fraction: number | null;
  label: string;
}

export interface WidgetDataState {
  data: DataResult | null;
  trend: TrendInfo | null;
  loading: boolean;
  error: string | null;
}

/** First row's `value` as a number; 0 for an empty result. */
export function singleValue(result: DataResult): number {
  return Number(result.rows[0]?.value ?? 0);
}

export function useWidgetData(widget: WidgetConfig): WidgetDataState {
  const { adapter, variables, crumbFilters } = useDashboard();

  // Dependency set is static per widget config — computed once.
  const deps = useMemo(() => extractVariableDeps(widget.dataSource.query), [widget]);

  // Key that changes only when a variable this widget depends on changes.
  const depKey = deps.map((name) => `${name}=${variables[name] ?? ""}`).join("&");
  const crumbKey = crumbFilters.map((f) => `${f.field}=${f.value}`).join("&");

  // Read the full variable map inside the effect without depending on it.
  const variablesRef = useRef(variables);
  variablesRef.current = variables;

  const [state, setState] = useState<WidgetDataState>({
    data: null,
    trend: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const query = withExtraFilters(widget.dataSource.query, crumbFilters);
    const vars = variablesRef.current;

    const run = async (): Promise<Omit<WidgetDataState, "loading" | "error">> => {
      const data = await adapter.fetch(query, vars);

      // Optional bigNumber trend chip: trailing N days vs the N days before.
      const windowDays = widget.type === "bigNumber" ? widget.options?.trendWindowDays : undefined;
      if (!windowDays) return { data, trend: null };

      const now = Date.now();
      const totalIn = async (start: number, end: number) =>
        singleValue(
          await adapter.fetch(
            {
              ...query,
              groupBy: undefined,
              granularity: undefined,
              dateRange: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
            },
            vars
          )
        );
      const [current, previous] = await Promise.all([
        totalIn(now - windowDays * DAY_MS, now),
        totalIn(now - 2 * windowDays * DAY_MS, now - windowDays * DAY_MS),
      ]);
      return {
        data,
        trend: {
          fraction: previous > 0 ? (current - previous) / previous : null,
          label: `last ${windowDays}d vs prior ${windowDays}d`,
        },
      };
    };

    run()
      .then((result) => {
        if (!cancelled) setState({ ...result, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ data: null, trend: null, loading: false, error: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
    // depKey/crumbKey intentionally stand in for `variables`/`crumbFilters`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, widget, depKey, crumbKey]);

  return state;
}
