/**
 * Distinct values of a dimension, for populating variable dropdowns from the
 * data itself (e.g. the Environment select — never a hardcoded list).
 */

import { useEffect, useState } from "react";
import type { DimensionField } from "../types/data";
import { useDashboard } from "../state/DashboardContext";

export function useDistinctValues(field: DimensionField): string[] {
  const { adapter } = useDashboard();
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    adapter
      .distinctValues(field)
      .then((v) => {
        if (!cancelled) setValues(v);
      })
      .catch(() => {
        if (!cancelled) setValues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, field]);

  return values;
}
