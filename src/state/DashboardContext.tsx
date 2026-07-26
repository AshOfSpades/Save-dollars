/**
 * Dashboard-level UI state: variable values, breadcrumb drill-down trail,
 * and the technical-detail toggle. Plain Context + hooks — deliberately no
 * external state library for the prototype.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DataSourceAdapter, QueryFilter, VariableValues } from "../adapters/DataSourceAdapter";
import type { Crumb, DashboardConfig } from "../config/schema";

export interface DashboardContextValue {
  config: DashboardConfig;
  adapter: DataSourceAdapter;

  /** Current variable values, keyed by variable name. */
  variables: VariableValues;
  setVariable: (name: string, value: string) => void;

  /**
   * Drill-down trail. crumbs[0] is always the root (no filter); the current
   * depth is crumbs.length - 1. This is dashboard-level state: crumb filters
   * apply to every widget.
   */
  crumbs: Crumb[];
  /** Filters contributed by the trail, ready to merge into widget queries. */
  crumbFilters: QueryFilter[];
  drillDepth: number;
  /** Append a crumb (chart segment clicked). */
  drillDown: (crumb: Crumb) => void;
  /** Truncate the trail back to crumb `index` (breadcrumb clicked). */
  jumpToCrumb: (index: number) => void;

  /**
   * Technical-detail lens. Independent from the breadcrumb trail: it reveals
   * `audience: "technical"` widgets at whatever depth the user is at.
   */
  technicalDetail: boolean;
  setTechnicalDetail: (on: boolean) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  config,
  adapter,
  children,
}: {
  config: DashboardConfig;
  adapter: DataSourceAdapter;
  children: ReactNode;
}) {
  const [variables, setVariables] = useState<VariableValues>(() =>
    Object.fromEntries(config.variables.map((v) => [v.name, v.default]))
  );
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ label: config.rootCrumbLabel }]);
  const [technicalDetail, setTechnicalDetail] = useState(false);

  const setVariable = useCallback((name: string, value: string) => {
    setVariables((prev) => (prev[name] === value ? prev : { ...prev, [name]: value }));
  }, []);

  const drillDown = useCallback((crumb: Crumb) => {
    setCrumbs((prev) => [...prev, crumb]);
  }, []);

  const jumpToCrumb = useCallback((index: number) => {
    setCrumbs((prev) => (index < prev.length - 1 ? prev.slice(0, index + 1) : prev));
  }, []);

  const crumbFilters = useMemo(
    () => crumbs.flatMap((c) => (c.filter ? [c.filter] : [])),
    [crumbs]
  );

  const value = useMemo<DashboardContextValue>(
    () => ({
      config,
      adapter,
      variables,
      setVariable,
      crumbs,
      crumbFilters,
      drillDepth: crumbs.length - 1,
      drillDown,
      jumpToCrumb,
      technicalDetail,
      setTechnicalDetail,
    }),
    [config, adapter, variables, setVariable, crumbs, crumbFilters, drillDown, jumpToCrumb, technicalDetail]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return ctx;
}
